import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.core.config import get_settings
from app.services.document_agent import DocumentSubmissionContext, ExpenseDocumentAgentResult, expense_document_agent
from app.services.ai import ReceiptOcrEngine

settings = get_settings()


@dataclass
class SubmittedCertification:
    certificate_name: str
    provider: str
    cost: float
    completion_date: date
    employee_name: str


@dataclass
class CertificationProofExtraction:
    proof_kind: str
    validation_status: str
    certificate_name: str | None
    provider: str | None
    candidate_name: str | None
    completion_date: date | None
    cost: float | None
    credential_id: str | None
    confidence: float
    notes: str
    workflow_json: str | None = None


class CertificationProofAnalyzer:
    name = "CertificationProofAnalyzer"

    def __init__(self):
        self.ocr_engine = ReceiptOcrEngine()

    def analyze(
        self,
        file_path: str,
        source_name: str | None,
        submitted: SubmittedCertification,
    ) -> CertificationProofExtraction:
        ocr = self.ocr_engine.run(file_path)
        ocr_text = ocr.text or Path(source_name or file_path).stem
        document_result = expense_document_agent.analyze(
            file_path,
            source_name,
            DocumentSubmissionContext(
                submission_type="CERTIFICATION_REIMBURSEMENT",
                ocr_text=ocr_text,
                employee_name=submitted.employee_name,
                certificate_name=submitted.certificate_name,
                provider=submitted.provider,
                cost=submitted.cost,
                completion_date=submitted.completion_date,
            ),
        )
        if document_result:
            return self._to_extraction(document_result)
        return self._fallback_ocr(file_path, source_name, submitted, ocr_text=ocr_text, ocr_confidence=ocr.average_confidence)

    def _fallback_ocr(
        self,
        file_path: str,
        source_name: str | None,
        submitted: SubmittedCertification,
        ocr_text: str | None = None,
        ocr_confidence: float | None = None,
    ) -> CertificationProofExtraction:
        text = ocr_text or Path(source_name or file_path).stem
        lower = text.lower()
        cost = self._extract_amount(text)
        completion_date = self._extract_date(text)
        credential_id = self._extract_credential_id(text)
        provider = submitted.provider if submitted.provider.lower() in lower else None
        certificate_name = submitted.certificate_name if self._soft_contains(lower, submitted.certificate_name) else None
        candidate_name = submitted.employee_name if self._soft_contains(lower, submitted.employee_name) else None

        matches = [
            bool(certificate_name),
            bool(provider),
            bool(candidate_name),
            completion_date == submitted.completion_date if completion_date else False,
            abs(cost - submitted.cost) <= max(1.0, submitted.cost * 0.03) if cost is not None else False,
        ]
        matched_count = sum(matches)
        proof_kind = self._fallback_proof_kind(lower, cost)
        validation_status = "MATCHED" if matched_count >= 3 and (cost is None or matches[-1]) else "NEEDS_ADMIN_REVIEW"
        confidence = min(0.85, max(0.25, ((ocr_confidence or 0) / 100 * 0.45) + (matched_count / 5 * 0.55)))
        notes = self._cert_note(validation_status, proof_kind, confidence, matched_count)
        return CertificationProofExtraction(
            proof_kind=proof_kind,
            validation_status=validation_status,
            certificate_name=certificate_name,
            provider=provider,
            candidate_name=candidate_name,
            completion_date=completion_date,
            cost=cost,
            credential_id=credential_id,
            confidence=round(confidence, 2),
            notes=notes,
            workflow_json=expense_document_agent.workflow_json(
                expense_document_agent.fallback_steps(proof_kind, validation_status, "UNKNOWN", "ADMIN_REVIEW")
            ),
        )

    def _to_extraction(self, result: ExpenseDocumentAgentResult) -> CertificationProofExtraction:
        return CertificationProofExtraction(
            proof_kind=self._normalize_proof_kind(result.proof_kind),
            validation_status=self._normalize_status(result.validation_status),
            certificate_name=result.certificate_name,
            provider=result.provider,
            candidate_name=result.candidate_name,
            completion_date=self._parse_date(result.completion_date),
            cost=result.cost,
            credential_id=result.credential_id,
            confidence=round(result.confidence, 2),
            notes=self._shorten(
                f"{self._status_prefix(result.validation_status)}: {self._proof_label(result.proof_kind)}, "
                f"{result.confidence:.0%} confidence. {result.notes or 'Multi-agent workflow checked the proof.'}",
                150,
            ),
            workflow_json=expense_document_agent.workflow_json(result.workflow_steps),
        )

    def _cert_note(self, validation_status: str, proof_kind: str, confidence: float, matched_count: int) -> str:
        return (
            f"{self._status_prefix(validation_status)}: {self._proof_label(proof_kind)}, "
            f"{confidence:.0%} confidence, {matched_count}/5 fields matched."
        )

    def _status_prefix(self, validation_status: str | None) -> str:
        return "Matched" if self._normalize_status(validation_status) == "MATCHED" else "Needs review"

    def _proof_label(self, proof_kind: str | None) -> str:
        labels = {
            "CERTIFICATE": "certificate proof",
            "PAYMENT_RECEIPT": "payment proof",
            "CERTIFICATE_AND_PAYMENT": "certificate + payment proof",
            "UNKNOWN": "unclear proof",
        }
        return labels.get(self._normalize_proof_kind(proof_kind), "unclear proof")

    def _shorten(self, value: str, limit: int) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 3].rstrip(" .,;") + "..."

    def _extract_amount(self, text: str) -> float | None:
        if "$" in text or re.search(r"\b(usd|dollars?)\b", text.lower()):
            usd_values: list[float] = []
            for pattern in [
                r"(?:amount\s*paid|paid|fee|cost|total|grand\s*total)\s*[:\-]?\s*(?:\$|usd)?\s*([0-9,]+(?:\.\d{1,2})?)",
                r"(?:\$|usd)\s*([0-9,]+(?:\.\d{1,2})?)",
            ]:
                for match in re.finditer(pattern, text, flags=re.I):
                    try:
                        usd_values.append(float(match.group(1).replace(",", "")))
                    except ValueError:
                        continue
            if usd_values:
                return round(max(usd_values) * settings.usd_rate, 2)
        patterns = [
            r"(?:amount\s*paid|paid|fee|cost|total|grand\s*total)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.\d{1,2})?)",
            r"(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)",
        ]
        values: list[float] = []
        for pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.I):
                try:
                    values.append(float(match.group(1).replace(",", "")))
                except ValueError:
                    continue
        return max(values) if values else None

    def _extract_date(self, text: str) -> date | None:
        patterns = [
            r"\b(20\d{2})[-/.](1[0-2]|0?[1-9])[-/.](3[01]|[12]\d|0?[1-9])\b",
            r"\b(3[01]|[12]\d|0?[1-9])[-/.](1[0-2]|0?[1-9])[-/.](20\d{2})\b",
        ]
        for index, pattern in enumerate(patterns):
            match = re.search(pattern, text)
            if not match:
                continue
            parts = [int(part) for part in match.groups()]
            try:
                if index == 0:
                    return date(parts[0], parts[1], parts[2])
                return date(parts[2], parts[1], parts[0])
            except ValueError:
                continue
        return None

    def _extract_credential_id(self, text: str) -> str | None:
        match = re.search(r"(?:credential|certificate|certification|id|verify)\s*(?:id|number|no)?\s*[:#-]?\s*([A-Z0-9-]{6,40})", text, re.I)
        return match.group(1) if match else None

    def _parse_date(self, value: str | None) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None

    def _soft_contains(self, text: str, value: str) -> bool:
        tokens = [token for token in re.split(r"\W+", value.lower()) if len(token) > 2]
        if not tokens:
            return False
        return sum(token in text for token in tokens) >= max(1, len(tokens) - 1)

    def _fallback_proof_kind(self, text: str, cost: float | None) -> str:
        has_certificate = bool(re.search(r"\b(certificate|certification|completed|completion|credential)\b", text))
        has_payment = cost is not None or bool(re.search(r"\b(payment|paid|invoice|receipt|fee)\b", text))
        if has_certificate and has_payment:
            return "CERTIFICATE_AND_PAYMENT"
        if has_certificate:
            return "CERTIFICATE"
        if has_payment:
            return "PAYMENT_RECEIPT"
        return "UNKNOWN"

    def _normalize_proof_kind(self, value: str | None) -> str:
        normalized = (value or "UNKNOWN").upper().replace(" ", "_")
        if normalized in {"CERTIFICATE", "PAYMENT_RECEIPT", "CERTIFICATE_AND_PAYMENT"}:
            return normalized
        return "UNKNOWN"

    def _normalize_status(self, value: str | None) -> str:
        normalized = (value or "").upper().replace(" ", "_")
        return "MATCHED" if normalized == "MATCHED" else "NEEDS_ADMIN_REVIEW"


certification_proof_analyzer = CertificationProofAnalyzer()
