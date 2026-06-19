import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import fitz
import pytesseract
from PIL import Image, ImageFilter, ImageOps

from app.core.config import get_settings
from app.services.document_agent import (
    AgentWorkflowStep,
    DocumentSubmissionContext,
    ExpenseDocumentAgentResult,
    expense_document_agent,
)

settings = get_settings()


@dataclass
class OcrResult:
    text: str
    average_confidence: float
    word_count: int


@dataclass
class ExtractedLineItem:
    description: str
    unit_price: float
    quantity: float
    total: float


@dataclass
class ExtractedReceiptFields:
    amount: float | None
    original_amount: float | None
    vendor: str | None
    expense_date: date | None
    gst_number: str | None
    tax_amount: float | None
    original_tax_amount: float | None
    tax_type: str | None
    line_items: list[ExtractedLineItem]
    currency_code: str
    structure_score: float


@dataclass
class ReceiptExtraction:
    amount: float | None
    normalized_claim_amount: float | None
    vendor: str | None
    expense_date: date | None
    gst_number: str | None
    tax_amount: float | None
    tax_type: str | None
    line_items: list[ExtractedLineItem]
    confidence: float
    receipt_kind: str
    notes: str
    policy_status: str
    budget_impact: str
    recommendation: str
    risk_score: float
    workflow_steps: list[AgentWorkflowStep]


class ReceiptOcrEngine:
    name = "ReceiptOcrEngine"

    def run(self, file_path: str) -> OcrResult:
        path = Path(file_path)
        try:
            if path.suffix.lower() == ".pdf":
                return self._ocr_pdf(path)
            return self._ocr_image(path)
        except Exception as exc:
            print(f"[{self.name}] OCR failed for {file_path}: {exc}")
            return OcrResult(text="", average_confidence=0.0, word_count=0)

    def _ocr_image(self, path: Path) -> OcrResult:
        image = Image.open(path)
        image = ImageOps.exif_transpose(image)
        # Upscale small images — handwritten bills on phone cameras are often low-res
        min_dim = min(image.width, image.height)
        if min_dim < 1200:
            scale = max(2, 1800 // min_dim)
            image = image.resize((image.width * scale, image.height * scale), Image.LANCZOS)
        image = image.convert("L")
        image = ImageOps.autocontrast(image)
        image = image.filter(ImageFilter.SHARPEN)
        return self._ocr_pil_image(image)

    def _ocr_pdf(self, path: Path) -> OcrResult:
        document = fitz.open(path)
        # First: native text extraction — perfect for digital PDFs, no Tesseract needed
        native_parts: list[str] = []
        for page_index in range(min(3, document.page_count)):
            page = document.load_page(page_index)
            native_parts.append(page.get_text())
        native_text = "\n".join(native_parts).strip()
        if len(native_text.split()) >= 5:
            return OcrResult(
                text=native_text,
                average_confidence=92.0,
                word_count=len(native_text.split()),
            )
        # Fall back to image OCR for scanned/image-only PDFs
        text_parts: list[str] = []
        confidences: list[float] = []
        word_count = 0
        for page_index in range(min(2, document.page_count)):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples).convert("L")
            result = self._ocr_pil_image(ImageOps.autocontrast(image), config="--oem 1 --psm 3")
            text_parts.append(result.text)
            if result.average_confidence > 0:
                confidences.append(result.average_confidence)
            word_count += result.word_count
        return OcrResult(
            text="\n".join(text_parts),
            average_confidence=sum(confidences) / len(confidences) if confidences else 0.0,
            word_count=word_count,
        )

    def _ocr_pil_image(self, image: Image.Image, config: str = "--oem 1 --psm 11") -> OcrResult:
        # --oem 1: LSTM only  --psm 11: sparse text (good for handwriting/scattered layout)
        # Callers may pass --psm 3 for structured printed documents (e.g. scanned PDFs)
        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config=config)
        except Exception:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        words: list[str] = []
        confidences: list[float] = []
        for text, conf in zip(data.get("text", []), data.get("conf", [])):
            value = str(text).strip()
            if not value:
                continue
            words.append(value)
            try:
                score = float(conf)
            except ValueError:
                continue
            if score >= 0:
                confidences.append(score)

        try:
            full_text = pytesseract.image_to_string(image, config=config)
        except Exception:
            full_text = pytesseract.image_to_string(image)
        if len(full_text.strip()) < len(" ".join(words)):
            full_text = " ".join(words)

        return OcrResult(
            text=full_text,
            average_confidence=sum(confidences) / len(confidences) if confidences else 0.0,
            word_count=len(words),
        )


class ReceiptFieldExtractor:
    name = "ReceiptFieldExtractor"

    def run(self, ocr: OcrResult, source_name: str | None) -> ExtractedReceiptFields:
        text = self._normalize_text(ocr.text or Path(source_name or "").stem)
        currency_code = self._detect_currency(text)
        original_amount = self._extract_amount(text)
        line_items = self._extract_line_items(text)
        if original_amount is None and line_items:
            original_amount = round(sum(item.total for item in line_items), 2)
        vendor = self._extract_vendor(text)
        expense_date = self._extract_date(text)
        gst_number = self._extract_gst_number(text)
        tax_type, original_tax_amount = self._extract_tax_fields(text)
        if original_amount is not None and original_tax_amount is not None and original_tax_amount >= original_amount:
            tax_type = None
            original_tax_amount = None
        amount = self._normalize_money(original_amount, currency_code)
        tax_amount = self._normalize_money(original_tax_amount, currency_code)
        structure_score = self._structure_score(text, amount, vendor, expense_date, gst_number)
        return ExtractedReceiptFields(
            amount=amount,
            original_amount=original_amount,
            vendor=vendor,
            expense_date=expense_date,
            gst_number=gst_number,
            tax_amount=tax_amount,
            original_tax_amount=original_tax_amount,
            tax_type=tax_type,
            line_items=line_items,
            currency_code=currency_code,
            structure_score=structure_score,
        )

    def _normalize_text(self, value: str) -> str:
        value = value.replace("\r", "\n")
        value = re.sub(r"[_-]+", " ", value)
        value = re.sub(r"[ \t]+", " ", value)
        return re.sub(r"\n{3,}", "\n\n", value).strip()

    def _extract_amount(self, text: str) -> float | None:
        patterns = [
            r"(?:grand\s*total|net\s*amount|amount\s*paid|total\s*amount|bill\s*amount|total)\s*[:\-]?\s*(?:rs\.?|inr|₹|\$|usd)?\s*([0-9,]+(?:\.\d{1,2})?)",
            r"(?:rs\.?|inr|₹|\$|usd)\s*([0-9,]+(?:\.\d{1,2})?)",
        ]
        candidates = self._amount_candidates(text, patterns)
        return max(candidates) if candidates else None

    def _extract_tax_fields(self, text: str) -> tuple[str | None, float | None]:
        values: list[float] = []
        detected_type: str | None = None
        skip_markers = [
            "taxable", "before tax", "after tax", "excluding tax", "including tax",
            "inclusive of tax", "tax included", "subtotal", "sub total",
            "gstin", "gst no", "gst number", "vat no", "vat number",
        ]
        for raw_line in text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            lower = line.lower()
            if not re.search(r"\b(cgst|sgst|igst|gst|vat|tax)\b", lower):
                continue
            if any(marker in lower for marker in skip_markers):
                continue
            line_type = "GST" if re.search(r"\b(cgst|sgst|igst|gst)\b", lower) else "VAT" if re.search(r"\bvat\b", lower) else "TAX"
            line_values: list[float] = []
            for match in re.finditer(r"(?:rs\.?|inr|₹|\$|usd)?\s*([0-9,]+(?:\.\d{1,2})?)", line, flags=re.I):
                end = match.end()
                start = match.start(1)
                if end < len(line) and line[end: end + 1] == "%":
                    continue
                if start > 0 and line[start - 1: start] == "%":
                    continue
                try:
                    line_values.append(float(match.group(1).replace(",", "")))
                except ValueError:
                    continue
            if not line_values:
                continue
            detected_type = "GST" if line_type == "GST" or detected_type == "GST" else line_type
            values.append(line_values[-1])
        return detected_type, round(sum(values), 2) if values else None

    def _extract_line_items(self, text: str) -> list[ExtractedLineItem]:
        items: list[ExtractedLineItem] = []
        for raw_line in text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            lower = line.lower()
            if not line or any(token in lower for token in ["total", "subtotal", "tax", "gst", "vat"]):
                continue
            match = re.search(
                r"^(?P<name>[A-Za-z][A-Za-z0-9 .,'/-]{1,80}?)?\s*[-:]?\s*(?P<unit>[0-9,]+(?:\.\d{1,2})?)\s*[xX*]\s*(?P<qty>[0-9,]+(?:\.\d{1,2})?)\b",
                line,
            )
            if not match:
                continue
            try:
                unit_price = float(match.group("unit").replace(",", ""))
                quantity = float(match.group("qty").replace(",", ""))
            except ValueError:
                continue
            if unit_price <= 0 or quantity <= 0:
                continue
            description = re.sub(r"\s+", " ", match.group("name") or "Line item").strip(" -:|")[:80] or "Line item"
            items.append(ExtractedLineItem(
                description=description,
                unit_price=unit_price,
                quantity=quantity,
                total=round(unit_price * quantity, 2),
            ))
        return items

    def _detect_currency(self, text: str) -> str:
        lowered = text.lower()
        if "$" in text or re.search(r"\b(usd|dollars?)\b", lowered):
            return "USD"
        return "INR"

    def _normalize_money(self, value: float | None, currency_code: str) -> float | None:
        if value is None:
            return None
        if currency_code == "USD":
            return round(value * settings.usd_rate, 2)
        return value

    def _amount_candidates(self, text: str, patterns: list[str]) -> list[float]:
        values: list[float] = []
        for pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.I):
                try:
                    values.append(float(match.group(1).replace(",", "")))
                except ValueError:
                    continue
        return values

    def _extract_gst_number(self, text: str) -> str | None:
        match = re.search(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b", text.upper())
        return match.group(0) if match else None

    _MONTH_MAP = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
        "jan": 1, "feb": 2, "mar": 3, "apr": 4,
        "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }

    def _extract_date(self, text: str) -> date | None:
        # Numeric formats: YYYY-MM-DD and DD/MM/YYYY
        numeric_patterns = [
            (r"\b(20\d{2})[-/.](1[0-2]|0?[1-9])[-/.](3[01]|[12]\d|0?[1-9])\b", "ymd"),
            (r"\b(3[01]|[12]\d|0?[1-9])[-/.](1[0-2]|0?[1-9])[-/.](20\d{2})\b", "dmy"),
        ]
        for pattern, fmt in numeric_patterns:
            match = re.search(pattern, text)
            if not match:
                continue
            parts = [int(p) for p in match.groups()]
            try:
                return date(parts[0], parts[1], parts[2]) if fmt == "ymd" else date(parts[2], parts[1], parts[0])
            except ValueError:
                continue
        # Written format: "June 17, 2026" / "17 June 2026"
        month_pat = r"\b(" + "|".join(self._MONTH_MAP) + r")\b"
        m = re.search(
            month_pat + r"[\s,]+(\d{1,2})[,\s]+(\d{4})", text, flags=re.I
        ) or re.search(
            r"\b(\d{1,2})[\s,]+" + month_pat + r"[\s,]+(\d{4})", text, flags=re.I
        )
        if m:
            groups = m.groups()
            try:
                if groups[0].lower() in self._MONTH_MAP:
                    return date(int(groups[2]), self._MONTH_MAP[groups[0].lower()], int(groups[1]))
                else:
                    return date(int(groups[2]), self._MONTH_MAP[groups[1].lower()], int(groups[0]))
            except (ValueError, KeyError):
                pass
        return None

    def _extract_vendor(self, text: str) -> str | None:
        blocked_tokens = {
            "invoice", "tax invoice", "receipt", "bill", "cash memo", "gst", "gstin",
            "date", "total", "amount", "subtotal", "qty", "rate", "price", "item",
            "description", "hsn", "payment", "cash", "credit", "debit", "balance",
            "original", "duplicate", "triplicate", "copy", "page", "no", "ref",
            "media", "image", "photo", "scan", "screenshot", "whatsapp",
            "thank you", "thanks", "welcome", "visit again", "please",
        }
        lines = [re.sub(r"[^A-Za-z0-9 &.,'/()-]", " ", line).strip(" .") for line in text.splitlines()]
        for line in lines[:15]:
            cleaned = re.sub(r"\s+", " ", line).strip()
            if len(cleaned) < 3 or len(cleaned) > 120:
                continue
            lower = cleaned.lower()
            # Skip lines that ARE or START WITH a blocked token
            if any(lower == tok or lower.startswith(f"{tok}:") or lower.startswith(f"{tok} ") for tok in blocked_tokens):
                continue
            # Skip GST numbers
            if re.search(r"\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]", cleaned.upper()):
                continue
            # Skip transaction IDs / hashes — single token, long, all alphanumeric, no spaces
            if re.fullmatch(r"[A-Za-z0-9]{12,}", cleaned):
                continue
            # Skip lines that are mostly digits/amounts (e.g. "1234 5678")
            alpha_chars = sum(ch.isalpha() for ch in cleaned)
            if alpha_chars < 3:
                continue
            # Require at least 40% of non-space chars to be alphabetic
            non_space = len(cleaned.replace(" ", ""))
            if non_space > 0 and alpha_chars / non_space < 0.40:
                continue
            # Skip short all-uppercase abbreviations (likely not a company name)
            if cleaned.isupper() and len(cleaned.split()) == 1 and len(cleaned) <= 4:
                continue
            return cleaned[:120]
        return None

    def _structure_score(
        self,
        text: str,
        amount: float | None,
        vendor: str | None,
        expense_date: date | None,
        gst_number: str | None,
    ) -> float:
        lower = text.lower()
        score = 0.0
        score += 0.18 if amount else 0
        score += 0.18 if vendor else 0
        score += 0.18 if expense_date else 0
        score += 0.16 if gst_number else 0
        score += 0.1 if re.search(r"\b(invoice|receipt|bill|tax|gst|total)\b", lower) else 0
        score += 0.1 if re.search(r"\b(cgst|sgst|igst|qty|rate|subtotal|payment)\b", lower) else 0
        return min(score, 1.0)


class BillTypeClassifier:
    name = "BillTypeClassifier"

    def run(self, ocr: OcrResult, fields: ExtractedReceiptFields, source_name: str | None) -> str:
        # When OCR failed completely, the AI agent is the primary classifier — don't guess HANDWRITTEN
        if ocr.word_count < 3:
            return "SYSTEM_GENERATED"
        lower = f"{ocr.text} {source_name or ''}".lower()
        if any(marker in lower for marker in ["hand", "handwritten", "manual", "written", "note"]):
            return "HANDWRITTEN"
        has_structured_marker = bool(re.search(r"\b(invoice|receipt|bill|tax|gst|total|cgst|sgst|igst)\b", lower))
        if has_structured_marker and fields.structure_score >= 0.4 and ocr.word_count >= 6:
            return "SYSTEM_GENERATED"
        if fields.structure_score >= 0.45 and ocr.average_confidence >= 62 and ocr.word_count >= 8:
            return "SYSTEM_GENERATED"
        return "HANDWRITTEN"


class ReceiptApprovalPolicy:
    name = "ReceiptApprovalPolicy"

    def run(self, ocr: OcrResult, fields: ExtractedReceiptFields, receipt_kind: str) -> tuple[float, str]:
        confidence = min(0.98, max(0.25, (ocr.average_confidence / 100 * 0.55) + (fields.structure_score * 0.45)))
        if receipt_kind == "SYSTEM_GENERATED":
            notes = f"Auto-approved: computer bill, {confidence:.0%} confidence."
        else:
            notes = f"Needs review: handwritten/unclear bill, {confidence:.0%} confidence."
        return round(confidence, 2), notes


class ReceiptAnalysisWorkflow:
    def __init__(self):
        self.ocr_engine = ReceiptOcrEngine()
        self.field_extractor = ReceiptFieldExtractor()
        self.type_classifier = BillTypeClassifier()
        self.approval_policy = ReceiptApprovalPolicy()

    def run(
        self,
        file_path: str,
        source_name: str | None = None,
        context: DocumentSubmissionContext | None = None,
    ) -> ReceiptExtraction:
        context = context or DocumentSubmissionContext(submission_type="EXPENSE_RECEIPT")
        ocr = self.ocr_engine.run(file_path)
        if not ocr.text.strip():
            ocr = OcrResult(text=Path(source_name or file_path).stem, average_confidence=35.0, word_count=0)
        context.ocr_text = ocr.text
        fields = self.field_extractor.run(ocr, source_name)
        fields = self._normalize_fields_with_submission_currency(fields, context)
        document_result = expense_document_agent.analyze(
            file_path,
            source_name,
            context,
        )
        if document_result:
            if document_result.receipt_kind:
                receipt_kind = document_result.receipt_kind
            elif document_result.amount is not None or document_result.vendor:
                # AI extracted data successfully — almost certainly a readable/printed bill
                receipt_kind = "SYSTEM_GENERATED"
            elif source_name and Path(source_name).suffix.lower() == ".pdf":
                receipt_kind = "SYSTEM_GENERATED"
            else:
                receipt_kind = "HANDWRITTEN"
            fields = self._merge_document_fields(fields, document_result)
            confidence = max(0.25, min(0.99, document_result.confidence))
            notes = self._document_notes(document_result)
            policy_status, budget_impact, recommendation, risk_score = self._document_decision(
                document_result,
                receipt_kind,
                confidence,
                fields,
                context,
            )
            workflow_steps = document_result.workflow_steps
        else:
            receipt_kind = self.type_classifier.run(ocr, fields, source_name)
            confidence, notes = self.approval_policy.run(ocr, fields, receipt_kind)
            policy_status, budget_impact, recommendation, risk_score = self._fallback_decision(fields, receipt_kind, confidence, context)
            workflow_steps = expense_document_agent.fallback_steps(receipt_kind, policy_status, budget_impact, recommendation)
        return ReceiptExtraction(
            amount=fields.amount,
            normalized_claim_amount=None,
            vendor=fields.vendor,
            expense_date=fields.expense_date,
            gst_number=fields.gst_number,
            tax_amount=fields.tax_amount,
            tax_type=fields.tax_type,
            line_items=fields.line_items,
            confidence=confidence,
            receipt_kind=receipt_kind,
            notes=notes,
            policy_status=policy_status,
            budget_impact=budget_impact,
            recommendation=recommendation,
            risk_score=risk_score,
            workflow_steps=workflow_steps,
        )

    def _merge_document_fields(
        self,
        fields: ExtractedReceiptFields,
        document_result: ExpenseDocumentAgentResult,
    ) -> ExtractedReceiptFields:
        agent_amount = self._normalize_money(document_result.amount, fields.currency_code) if document_result.amount is not None else None
        # Prefer AI-extracted line items (handles handwritten bills); fall back to regex-extracted ones
        ai_items = [
            ExtractedLineItem(
                description=getattr(item, "description", None) or "Line item",
                unit_price=float(getattr(item, "unit_price", None) or 0),
                quantity=float(getattr(item, "quantity", None) or 1),
                total=float(getattr(item, "total", None) or 0),
            )
            for item in (document_result.line_items or [])
            if (getattr(item, "total", None) or 0) > 0
        ]
        merged_items = ai_items or fields.line_items
        return ExtractedReceiptFields(
            amount=agent_amount if agent_amount is not None else fields.amount,
            original_amount=fields.original_amount,
            vendor=document_result.vendor or fields.vendor,
            expense_date=self._parse_document_date(document_result.expense_date) or fields.expense_date,
            gst_number=document_result.gst_number or fields.gst_number,
            tax_amount=self._normalize_money(document_result.tax_amount, fields.currency_code) if document_result.tax_amount is not None else fields.tax_amount,
            original_tax_amount=fields.original_tax_amount,
            tax_type=fields.tax_type,
            line_items=merged_items,
            currency_code=fields.currency_code,
            structure_score=fields.structure_score,
        )

    def _normalize_fields_with_submission_currency(
        self,
        fields: ExtractedReceiptFields,
        context: DocumentSubmissionContext,
    ) -> ExtractedReceiptFields:
        if (
            fields.currency_code == "INR"
            and (context.submitted_currency or "").upper() == "USD"
            and fields.amount is not None
            and context.submitted_original_amount is not None
            and abs(fields.amount - context.submitted_original_amount) <= max(1.0, context.submitted_original_amount * 0.05)
        ):
            return ExtractedReceiptFields(
                amount=self.field_extractor._normalize_money(fields.amount, "USD"),
                original_amount=fields.original_amount,
                vendor=fields.vendor,
                expense_date=fields.expense_date,
                gst_number=fields.gst_number,
                tax_amount=self.field_extractor._normalize_money(fields.tax_amount, "USD"),
                original_tax_amount=fields.original_tax_amount,
                tax_type=fields.tax_type,
                line_items=fields.line_items,
                currency_code="USD",
                structure_score=fields.structure_score,
            )
        return fields

    def _normalize_money(self, value: float | None, currency_code: str) -> float | None:
        return self.field_extractor._normalize_money(value, currency_code)

    def _parse_document_date(self, value: str | None) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None

    def _document_notes(self, document_result: ExpenseDocumentAgentResult) -> str:
        label = "computer bill" if document_result.receipt_kind == "SYSTEM_GENERATED" else "handwritten/unclear bill"
        prefix = "Auto-approved" if document_result.receipt_kind == "SYSTEM_GENERATED" else "Needs review"
        notes = document_result.notes or f"{prefix}: {label}, {document_result.confidence:.0%} confidence."
        return self._shorten(notes, 150)

    def _amount_matches(self, fields: ExtractedReceiptFields, context: DocumentSubmissionContext) -> bool:
        if fields.amount is None or context.amount is None:
            return False
        return abs(fields.amount - context.amount) <= max(1.0, context.amount * 0.05)

    def _document_decision(
        self,
        document_result: ExpenseDocumentAgentResult,
        receipt_kind: str,
        confidence: float,
        fields: ExtractedReceiptFields,
        context: DocumentSubmissionContext,
    ) -> tuple[str, str, str, float]:
        policy_status = document_result.policy_status or ("COMPLIANT" if receipt_kind == "SYSTEM_GENERATED" else "NEEDS_REVIEW")
        budget_impact = document_result.budget_impact or "UNKNOWN"
        recommendation = document_result.recommendation
        if receipt_kind == "SYSTEM_GENERATED" and confidence >= 0.65 and self._amount_matches(fields, context):
            policy_status = "COMPLIANT"
            recommendation = "AUTO_APPROVE_RECEIPT"
        if not recommendation:
            recommendation = "AUTO_APPROVE_RECEIPT" if receipt_kind == "SYSTEM_GENERATED" and confidence >= 0.75 else "ADMIN_REVIEW"
        risk_score = document_result.risk_score
        if risk_score is None:
            risk_score = 0.18 if recommendation == "AUTO_APPROVE_RECEIPT" else 0.56
        return policy_status, budget_impact, recommendation, round(risk_score, 2)

    def _fallback_decision(
        self,
        fields: ExtractedReceiptFields,
        receipt_kind: str,
        confidence: float,
        context: DocumentSubmissionContext,
    ) -> tuple[str, str, str, float]:
        amount_mismatch = (
            fields.amount is not None
            and context.amount is not None
            and abs(fields.amount - context.amount) > max(1.0, context.amount * 0.05)
        )
        budget_percent = context.budget_percent_used or 0
        threshold = context.budget_threshold_percent or 90
        if budget_percent >= threshold:
            budget_impact = "BREACH_RISK"
        elif budget_percent >= threshold * 0.85:
            budget_impact = "WATCH"
        else:
            budget_impact = "SAFE"
        if amount_mismatch:
            policy_status = "NEEDS_REVIEW"
            recommendation = "ADMIN_REVIEW"
            risk_score = 0.66
        elif receipt_kind == "SYSTEM_GENERATED" and confidence >= 0.75:
            policy_status = "COMPLIANT"
            recommendation = "AUTO_APPROVE_RECEIPT"
            risk_score = 0.18
        else:
            policy_status = "NEEDS_REVIEW"
            recommendation = "ADMIN_REVIEW"
            risk_score = 0.54
        if budget_impact == "BREACH_RISK":
            risk_score = min(0.95, risk_score + 0.18)
        return policy_status, budget_impact, recommendation, round(risk_score, 2)

    def _shorten(self, value: str, limit: int) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 3].rstrip(" .,;") + "..."


class ReceiptAnalyzer:
    """Compatibility wrapper used by the expense router."""

    def __init__(self):
        self.workflow = ReceiptAnalysisWorkflow()

    def analyze(
        self,
        file_path: str,
        source_name: str | None = None,
        context: DocumentSubmissionContext | None = None,
    ) -> ReceiptExtraction:
        if settings.vertex_enabled:
            return self._analyze_with_vertex(file_path, source_name, context)
        return self.workflow.run(file_path, source_name, context)

    def _analyze_with_vertex(
        self,
        file_path: str,
        source_name: str | None = None,
        context: DocumentSubmissionContext | None = None,
    ) -> ReceiptExtraction:
        print(f"[vertex:placeholder] Analyze {file_path}")
        return self.workflow.run(file_path, source_name, context)


receipt_analyzer = ReceiptAnalyzer()
