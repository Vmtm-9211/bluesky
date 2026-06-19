import asyncio
import json
import mimetypes
import os
import re
import threading
from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import TypeVar
from uuid import uuid4

from pydantic import BaseModel, Field

from app.core.config import get_settings

try:
    from google.genai import types as genai_types
except ImportError:
    genai_types = None

try:
    from google.adk.agents.llm_agent import Agent as AdkAgent
    from google.adk.runners import Runner as AdkRunner
    from google.adk.sessions import InMemorySessionService
except ImportError:
    try:
        from google.adk import Agent as AdkAgent
        from google.adk.runners import Runner as AdkRunner
        from google.adk.sessions import InMemorySessionService
    except ImportError:
        AdkAgent = None
        AdkRunner = None
        InMemorySessionService = None

settings = get_settings()
T = TypeVar("T", bound=BaseModel)


@dataclass
class DocumentSubmissionContext:
    submission_type: str
    ocr_text: str | None = None
    employee_name: str | None = None
    department_name: str | None = None
    category_name: str | None = None
    vendor: str | None = None
    amount: float | None = None
    submitted_currency: str | None = None
    submitted_original_amount: float | None = None
    expense_date: date | None = None
    budget_percent_used: float | None = None
    budget_threshold_percent: float | None = None
    certificate_name: str | None = None
    provider: str | None = None
    cost: float | None = None
    completion_date: date | None = None
    usd_rate: float = settings.usd_rate


class AgentWorkflowStep(BaseModel):
    agent_name: str
    status: str = "COMPLETED"
    summary: str


class LineItemResult(BaseModel):
    description: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    total: float | None = None


class DocumentExtractionResult(BaseModel):
    vendor: str | None = None
    amount: float | None = None
    expense_date: str | None = None
    gst_number: str | None = None
    tax_amount: float | None = None
    line_items: list[LineItemResult] | None = None
    certificate_name: str | None = None
    provider: str | None = None
    candidate_name: str | None = None
    completion_date: str | None = None
    cost: float | None = None
    credential_id: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class DocumentClassificationResult(BaseModel):
    submission_type: str = "EXPENSE_RECEIPT"
    document_type: str | None = None
    receipt_kind: str | None = None
    proof_kind: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class PolicyComplianceResult(BaseModel):
    policy_status: str = "NEEDS_REVIEW"
    validation_status: str | None = None
    mismatch_summary: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class BudgetRiskResult(BaseModel):
    budget_impact: str = "UNKNOWN"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class ApprovalRoutingResult(BaseModel):
    recommendation: str = "ADMIN_REVIEW"
    risk_score: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class ExpenseDocumentAgentResult(BaseModel):
    submission_type: str = Field(description="EXPENSE_RECEIPT or CERTIFICATION_REIMBURSEMENT")
    receipt_kind: str | None = Field(default=None, description="SYSTEM_GENERATED or HANDWRITTEN for expense receipts")
    vendor: str | None = None
    amount: float | None = None
    expense_date: str | None = Field(default=None, description="YYYY-MM-DD if visible")
    gst_number: str | None = None
    tax_amount: float | None = None
    line_items: list[LineItemResult] | None = None
    proof_kind: str | None = Field(default=None, description="CERTIFICATE, PAYMENT_RECEIPT, CERTIFICATE_AND_PAYMENT, or UNKNOWN")
    validation_status: str | None = Field(default=None, description="MATCHED or NEEDS_ADMIN_REVIEW")
    certificate_name: str | None = None
    provider: str | None = None
    candidate_name: str | None = None
    completion_date: str | None = Field(default=None, description="YYYY-MM-DD if visible")
    cost: float | None = None
    credential_id: str | None = None
    policy_status: str | None = Field(default=None, description="COMPLIANT, NEEDS_REVIEW, or POLICY_VIOLATION")
    budget_impact: str | None = Field(default=None, description="SAFE, WATCH, BREACH_RISK, or UNKNOWN")
    recommendation: str | None = Field(default=None, description="AUTO_APPROVE_RECEIPT, ADMIN_REVIEW, APPROVE_AFTER_RECEIPT_REVIEW, or REJECT_SUSPICIOUS")
    risk_score: float | None = Field(default=None, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None
    workflow_steps: list[AgentWorkflowStep] = []


class ExpenseDocumentAgent:
    name = "expense_multi_agent_workflow"

    def __init__(self):
        self.api_key = settings.google_api_key or settings.gemini_api_key
        self.document_extraction_agent = None
        self.document_classifier_agent = None
        self.policy_compliance_agent = None
        self.budget_risk_agent = None
        self.approval_router_agent = None
        if self.api_key and AdkAgent and AdkRunner and InMemorySessionService and genai_types:
            os.environ["GOOGLE_API_KEY"] = self.api_key
            os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
            self.document_extraction_agent = self._build_agent(
                "document_extraction_agent",
                "Extracts raw financial fields from expense receipts and certification proofs.",
                self._extractor_instruction(),
                DocumentExtractionResult,
            )
            self.document_classifier_agent = self._build_agent(
                "document_classifier_agent",
                "Classifies uploaded documents by type and generated/handwritten format.",
                self._classifier_instruction(),
                DocumentClassificationResult,
            )
            self.policy_compliance_agent = self._build_agent(
                "policy_compliance_agent",
                "Compares extracted document data against the user claim and company policy.",
                self._policy_instruction(),
                PolicyComplianceResult,
            )
            self.budget_risk_agent = self._build_agent(
                "budget_risk_agent",
                "Assesses department budget threshold impact.",
                self._budget_instruction(),
                BudgetRiskResult,
            )
            self.approval_router_agent = self._build_agent(
                "approval_router_agent",
                "Routes the claim to receipt approval, admin review, or rejection recommendation.",
                self._router_instruction(),
                ApprovalRoutingResult,
            )

    @property
    def available(self) -> bool:
        return all(
            [
                self.document_extraction_agent,
                self.document_classifier_agent,
                self.policy_compliance_agent,
                self.budget_risk_agent,
                self.approval_router_agent,
            ]
        )

    @property
    def workflow_names(self) -> list[str]:
        return [
            "document_extraction_agent",
            "document_classifier_agent",
            "policy_compliance_agent",
            "budget_risk_agent",
            "approval_router_agent",
        ]

    def analyze(
        self,
        file_path: str,
        source_name: str | None,
        context: DocumentSubmissionContext,
    ) -> ExpenseDocumentAgentResult | None:
        if not self.available:
            return None
        path = Path(file_path)
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        agent_path = path if path.exists() else None
        base_prompt = self._context_prompt(path, source_name, context)
        try:
            extraction = self._run_sync(
                self.document_extraction_agent,
                DocumentExtractionResult,
                agent_path,
                mime_type,
                f"{base_prompt}\nInspect the attached document image/PDF when present. Use OCR text as helper text only; it may be blank or noisy. Return only JSON.",
            )
            classification = self._run_sync(
                self.document_classifier_agent,
                DocumentClassificationResult,
                agent_path,
                mime_type,
                f"{base_prompt}\nExtracted fields:\n{extraction.model_dump_json()}\nClassify using the attached document and extracted fields. Return only JSON.",
            )
            policy = self._run_sync(
                self.policy_compliance_agent,
                PolicyComplianceResult,
                None,
                None,
                f"{base_prompt}\nExtraction:\n{extraction.model_dump_json()}\nClassification:\n{classification.model_dump_json()}\nEvaluate policy compliance.",
            )
            budget = self._run_sync(
                self.budget_risk_agent,
                BudgetRiskResult,
                None,
                None,
                f"{base_prompt}\nPolicy:\n{policy.model_dump_json()}\nAssess budget threshold impact.",
            )
            routing = self._run_sync(
                self.approval_router_agent,
                ApprovalRoutingResult,
                None,
                None,
                (
                    f"{base_prompt}\nExtraction:\n{extraction.model_dump_json()}\n"
                    f"Classification:\n{classification.model_dump_json()}\nPolicy:\n{policy.model_dump_json()}\n"
                    f"Budget:\n{budget.model_dump_json()}\nReturn the final routing decision."
                ),
            )
            return self._compose_result(context, extraction, classification, policy, budget, routing)
        except Exception as exc:
            print(f"[{self.name}] ADK multi-agent workflow failed for {file_path}: {exc}")
            return None

    def _build_agent(self, name: str, description: str, instruction: str, output_schema: type[BaseModel]):
        return AdkAgent(
            model=settings.gemini_model,
            name=name,
            description=description,
            instruction=instruction,
            output_schema=output_schema,
            output_key=name,
            generate_content_config=genai_types.GenerateContentConfig(temperature=0),
        )

    async def _run_async(
        self,
        agent,
        schema: type[T],
        path: Path | None,
        mime_type: str | None,
        prompt: str,
    ) -> T:
        app_name = "expense_multi_agent_adk"
        user_id = "expense_backend"
        session_id = f"agent-{uuid4().hex}"
        session_service = InMemorySessionService()
        await self._maybe_await(session_service.create_session(app_name=app_name, user_id=user_id, session_id=session_id))
        runner = AdkRunner(agent=agent, app_name=app_name, session_service=session_service)
        parts = [genai_types.Part(text=prompt)]
        if path and mime_type:
            parts.append(genai_types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type))
        message = genai_types.Content(role="user", parts=parts)
        final_payload = ""
        async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=message):
            event_payload = self._event_text(event)
            if event_payload:
                final_payload = event_payload
        if not final_payload:
            raise ValueError(f"{getattr(agent, 'name', 'agent')} returned empty output")
        return self._parse_payload(schema, final_payload)

    async def _maybe_await(self, value):
        if isinstance(value, Awaitable):
            return await value
        return value

    def _run_sync(
        self,
        agent,
        schema: type[T],
        path: Path | None,
        mime_type: str | None,
        prompt: str,
    ) -> T:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self._run_async(agent, schema, path, mime_type, prompt))

        result: dict[str, T | None] = {"value": None}
        error: dict[str, BaseException | None] = {"value": None}

        def target():
            try:
                result["value"] = asyncio.run(self._run_async(agent, schema, path, mime_type, prompt))
            except BaseException as exc:
                error["value"] = exc

        thread = threading.Thread(target=target, daemon=True)
        thread.start()
        thread.join()
        if error["value"]:
            raise error["value"]
        if result["value"] is None:
            raise ValueError(f"{getattr(agent, 'name', 'agent')} produced no result")
        return result["value"]

    def _event_text(self, event) -> str:
        content = getattr(event, "content", None)
        parts = getattr(content, "parts", None) or []
        values = [getattr(part, "text", None) for part in parts]
        return "\n".join(value.strip() for value in values if value and value.strip())

    def _parse_payload(self, schema: type[T], payload: str) -> T:
        cleaned = payload.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        try:
            return schema.model_validate_json(cleaned)
        except ValueError:
            match = re.search(r"\{.*\}", cleaned, flags=re.S)
            if not match:
                raise
            return schema.model_validate_json(match.group(0))

    def _context_prompt(self, path: Path, source_name: str | None, context: DocumentSubmissionContext) -> str:
        return (
            "Company expense multi-agent workflow context:\n"
            f"submission_type: {context.submission_type}\n"
            f"source_file: {source_name or path.name}\n"
            f"employee_name: {context.employee_name or '-'}\n"
            f"department_name: {context.department_name or '-'}\n"
            f"submitted_category: {context.category_name or '-'}\n"
            f"submitted_vendor: {context.vendor or '-'}\n"
            f"submitted_amount: {context.amount if context.amount is not None else '-'}\n"
            f"submitted_currency: {context.submitted_currency or 'INR'}\n"
            f"submitted_original_amount: {context.submitted_original_amount if context.submitted_original_amount is not None else '-'}\n"
            f"submitted_expense_date: {context.expense_date.isoformat() if context.expense_date else '-'}\n"
            f"current_budget_percent_used: {context.budget_percent_used if context.budget_percent_used is not None else '-'}\n"
            f"budget_alert_threshold_percent: {context.budget_threshold_percent if context.budget_threshold_percent is not None else '-'}\n"
            f"submitted_certificate_name: {context.certificate_name or '-'}\n"
            f"submitted_provider: {context.provider or '-'}\n"
            f"submitted_cost: {context.cost if context.cost is not None else '-'}\n"
            f"submitted_completion_date: {context.completion_date.isoformat() if context.completion_date else '-'}\n"
            f"money_storage_currency: INR\n"
            f"usd_to_inr_rate: {context.usd_rate}\n"
            f"ocr_text:\n{self._ocr_text(context.ocr_text)}"
        )

    def _ocr_text(self, value: str | None) -> str:
        cleaned = re.sub(r"\s+", " ", value or "").strip()
        if not cleaned:
            return "-"
        return cleaned[:12000]

    def _compose_result(
        self,
        context: DocumentSubmissionContext,
        extraction: DocumentExtractionResult,
        classification: DocumentClassificationResult,
        policy: PolicyComplianceResult,
        budget: BudgetRiskResult,
        routing: ApprovalRoutingResult,
    ) -> ExpenseDocumentAgentResult:
        confidence_values = [
            extraction.confidence,
            classification.confidence,
            policy.confidence,
            budget.confidence,
            routing.confidence,
        ]
        # Only average agents that contributed (non-zero); default-zero agents shouldn't drag confidence down
        active = [v for v in confidence_values if v > 0]
        confidence = sum(active) / len(active) if active else 0.25
        workflow_steps = [
            AgentWorkflowStep(agent_name="document_extraction_agent", summary=self._shorten(extraction.notes or "Extracted document fields.", 110)),
            AgentWorkflowStep(agent_name="document_classifier_agent", summary=self._shorten(classification.notes or "Classified document type.", 110)),
            AgentWorkflowStep(agent_name="policy_compliance_agent", summary=self._shorten(policy.notes or "Checked claim against policy.", 110)),
            AgentWorkflowStep(agent_name="budget_risk_agent", summary=self._shorten(budget.notes or "Checked budget threshold impact.", 110)),
            AgentWorkflowStep(agent_name="approval_router_agent", summary=self._shorten(routing.notes or "Produced final routing decision.", 110)),
        ]
        return ExpenseDocumentAgentResult(
            submission_type=self._normalize_submission_type(classification.submission_type or context.submission_type),
            receipt_kind=self._normalize_receipt_kind(classification.receipt_kind),
            vendor=extraction.vendor,
            amount=extraction.amount,
            expense_date=extraction.expense_date,
            gst_number=extraction.gst_number,
            tax_amount=extraction.tax_amount,
            line_items=extraction.line_items,
            proof_kind=self._normalize_proof_kind(classification.proof_kind),
            validation_status=self._normalize_validation_status(policy.validation_status),
            certificate_name=extraction.certificate_name,
            provider=extraction.provider,
            candidate_name=extraction.candidate_name,
            completion_date=extraction.completion_date,
            cost=extraction.cost,
            credential_id=extraction.credential_id,
            policy_status=self._normalize_policy_status(policy.policy_status),
            budget_impact=self._normalize_budget_impact(budget.budget_impact),
            recommendation=self._normalize_recommendation(routing.recommendation),
            risk_score=max(0.0, min(1.0, routing.risk_score)),
            confidence=max(0.0, min(1.0, confidence)),
            notes=self._shorten(routing.notes or policy.notes or classification.notes or extraction.notes or "Multi-agent review complete.", 150),
            workflow_steps=workflow_steps,
        )

    def fallback_steps(
        self,
        receipt_kind: str,
        policy_status: str,
        budget_impact: str,
        recommendation: str,
    ) -> list[AgentWorkflowStep]:
        return [
            AgentWorkflowStep(agent_name="document_extraction_agent", status="FALLBACK", summary="Local OCR extracted visible fields."),
            AgentWorkflowStep(agent_name="document_classifier_agent", status="FALLBACK", summary=f"Classified as {receipt_kind.replace('_', ' ').lower()}."),
            AgentWorkflowStep(agent_name="policy_compliance_agent", status="FALLBACK", summary=f"Policy outcome: {policy_status.replace('_', ' ').lower()}."),
            AgentWorkflowStep(agent_name="budget_risk_agent", status="FALLBACK", summary=f"Budget signal: {budget_impact.replace('_', ' ').lower()}."),
            AgentWorkflowStep(agent_name="approval_router_agent", status="FALLBACK", summary=f"Final route: {recommendation.replace('_', ' ').lower()}."),
        ]

    def workflow_json(self, steps: list[AgentWorkflowStep]) -> str:
        return json.dumps([step.model_dump() for step in steps])

    def _normalize_submission_type(self, value: str | None) -> str:
        normalized = (value or "").upper().replace(" ", "_")
        if normalized == "CERTIFICATION_REIMBURSEMENT":
            return normalized
        return "EXPENSE_RECEIPT"

    def _normalize_receipt_kind(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        if normalized in {"SYSTEM", "PRINTED", "COMPUTER_GENERATED", "PRINTED_BILL"}:
            return "SYSTEM_GENERATED"
        if normalized == "SYSTEM_GENERATED":
            return normalized
        return "HANDWRITTEN"

    def _normalize_proof_kind(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        if normalized in {"CERTIFICATE", "PAYMENT_RECEIPT", "CERTIFICATE_AND_PAYMENT"}:
            return normalized
        return "UNKNOWN"

    def _normalize_validation_status(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        return "MATCHED" if normalized == "MATCHED" else "NEEDS_ADMIN_REVIEW"

    def _normalize_policy_status(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        if normalized in {"COMPLIANT", "POLICY_VIOLATION"}:
            return normalized
        return "NEEDS_REVIEW"

    def _normalize_budget_impact(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        if normalized in {"SAFE", "WATCH", "BREACH_RISK"}:
            return normalized
        return "UNKNOWN"

    def _normalize_recommendation(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.upper().replace(" ", "_")
        if normalized in {"AUTO_APPROVE_RECEIPT", "APPROVE_AFTER_RECEIPT_REVIEW", "REJECT_SUSPICIOUS"}:
            return normalized
        return "ADMIN_REVIEW"

    def _shorten(self, value: str, limit: int) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 3].rstrip(" .,;") + "..."

    def _extractor_instruction(self) -> str:
        return """
You are document_extraction_agent. Extract only visible fields from the uploaded finance document.
The document may be HANDWRITTEN or PRINTED. Always inspect the attached image/PDF directly — this is your primary source.
Use the OCR text provided only as a secondary hint; it will often be blank, garbled, or incomplete for handwritten documents.

For expense receipts, extract:
- vendor: the business name visible on the document (top header, stamp, or letterhead). Do NOT use file names, item names, or generic words like "receipt", "bill", "invoice", "cash", "image". Only the actual shop/restaurant/company name.
- amount: the final total/grand total charged (a single number, in INR).
- expense_date: date on the receipt in YYYY-MM-DD format. Handwritten dates may appear as DD/MM/YYYY or DD-MM-YYYY — convert them.
- gst_number: GST/GSTIN registration number if visible (e.g., 22AAAAA0000A1Z5).
- tax_amount: actual tax charged (GST/VAT amount) — NOT the subtotal, NOT a percentage.
- line_items: ALL individual items listed in the bill as an array. For each item include:
    description (item name), quantity (number of units), unit_price (price per unit), total (quantity × unit_price).
  For handwritten bills, try to read each line carefully even if the handwriting is messy.
  If a line only shows an item name and a total without separate quantity/unit_price, use quantity=1 and unit_price=total.

HANDWRITTEN BILLS: Try your best to read all handwritten text, numbers, and symbols. Even rough estimates are better than null.
Vendor names on handwritten bills are often written at the top in large cursive or block letters.
Dates on handwritten bills are often in DD/MM/YYYY format.
Amounts on handwritten bills may use ₹, Rs., or just a number after the item list.

For certification proof extract certificate_name, provider, candidate_name, completion_date, cost, and credential_id.
Return cost in INR. If the proof shows USD/$, convert USD to INR using usd_to_inr_rate.
Never invent missing values. Return strict JSON for the schema.
"""

    def _classifier_instruction(self) -> str:
        return """
You are document_classifier_agent. Classify the document for the expense platform.
Inspect the image or PDF directly when present — OCR text may be poor or empty for handwritten documents, so do NOT rely on it alone.
For receipts, receipt_kind MUST always be set — never return null. Use exactly one of:
  SYSTEM_GENERATED — printed, POS-generated, e-invoice, PDF, computer-typed, or any digitally-produced bill.
  HANDWRITTEN — written by hand (pen/pencil), even if partially pre-printed.
When in doubt, default to SYSTEM_GENERATED (most bills are computer-generated).
Look at the visual appearance: printed text has uniform fonts and clean lines; handwritten text has irregular strokes and varying letter sizes.
For certifications, proof_kind must be CERTIFICATE, PAYMENT_RECEIPT, CERTIFICATE_AND_PAYMENT, or UNKNOWN.
Return strict JSON for the schema.
"""

    def _policy_instruction(self) -> str:
        return """
You are policy_compliance_agent. Compare submitted claim context with extracted document values.
Return COMPLIANT when the amount matches within normal rounding tolerance, vendor/category are reasonable, and the receipt is clear.
Do not require submitted_expense_date and extracted receipt expense_date to match; bill date and submission date can differ.
Return NEEDS_REVIEW for handwritten, missing critical fields, category mismatch, medium confidence, amount mismatch, or vendor mismatch.
Return POLICY_VIOLATION only for clear fraud or impossible claims.
For certifications, validation_status is MATCHED only when proof mostly agrees with submitted certificate/provider/cost/date/employee.
Return strict JSON for the schema.
"""

    def _budget_instruction(self) -> str:
        return """
You are budget_risk_agent. Use current_budget_percent_used and budget_alert_threshold_percent.
budget_impact is BREACH_RISK when projected spend is at/over threshold, WATCH when close, SAFE when comfortably below, UNKNOWN when no budget exists.
Return strict JSON for the schema.
"""

    def _router_instruction(self) -> str:
        return """
You are approval_router_agent. Produce the final routing decision.
Use AUTO_APPROVE_RECEIPT only for system-generated, compliant, clear low-risk receipts.
Use ADMIN_REVIEW for handwritten, unclear, mismatched, missing-field, or budget-sensitive claims.
Use REJECT_SUSPICIOUS only for clear policy violation.
Return strict JSON for the schema.
"""


expense_document_agent = ExpenseDocumentAgent()
