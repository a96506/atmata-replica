import type { EmailEvent, FunctionLocale } from "./contracts";

export type EmailTemplateCopy = {
  subject: string;
  heading: string;
  body: string;
  action: string;
};

const COPY: Record<FunctionLocale, Record<EmailEvent, EmailTemplateCopy>> = {
  en: {
    quote_sent: {
      subject: "Quotation from {company}",
      heading: "Your quotation is ready",
      body: "{company} has sent quotation {reference}.",
      action: "View quotation",
    },
    rfq_invitation: {
      subject: "Request for quotation from {company}",
      heading: "Request for quotation",
      body: "{company} invites you to respond to RFQ {reference}.",
      action: "View request",
    },
    approval_requested: {
      subject: "Approval requested: {reference}",
      heading: "Approval required",
      body: "{company} needs your review of {reference}.",
      action: "Review request",
    },
    approval_rejected: {
      subject: "Approval rejected: {reference}",
      heading: "Approval rejected",
      body: "The approval request for {reference} was rejected.",
      action: "View details",
    },
    user_invitation: {
      subject: "Invitation to join {company}",
      heading: "You are invited",
      body: "You have been invited to join {company}.",
      action: "Accept invitation",
    },
  },
  ar: {
    quote_sent: {
      subject: "عرض سعر من {company}",
      heading: "عرض السعر جاهز",
      body: "أرسلت لك {company} عرض السعر {reference}.",
      action: "عرض السعر",
    },
    rfq_invitation: {
      subject: "طلب عرض سعر من {company}",
      heading: "طلب عرض سعر",
      body: "تدعوك {company} للرد على طلب عرض السعر {reference}.",
      action: "عرض الطلب",
    },
    approval_requested: {
      subject: "مطلوب اعتماد: {reference}",
      heading: "مطلوب اعتماد",
      body: "تحتاج {company} إلى مراجعتك للمستند {reference}.",
      action: "مراجعة الطلب",
    },
    approval_rejected: {
      subject: "رُفض الاعتماد: {reference}",
      heading: "رُفض الاعتماد",
      body: "تم رفض طلب اعتماد المستند {reference}.",
      action: "عرض التفاصيل",
    },
    user_invitation: {
      subject: "دعوة للانضمام إلى {company}",
      heading: "لديك دعوة",
      body: "تمت دعوتك للانضمام إلى {company}.",
      action: "قبول الدعوة",
    },
  },
};

export function getEmailTemplateCopy(
  event: EmailEvent,
  locale: FunctionLocale,
): EmailTemplateCopy {
  return COPY[locale][event];
}
