/**
 * Sends the daily Excel report by email.
 * Requires SMTP and REPORT_EMAIL to be configured.
 */
export interface ReportEmailConfig {
    to: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
}
export declare function sendReportEmail(buffer: Buffer, config: ReportEmailConfig): Promise<void>;
//# sourceMappingURL=send-report-email.d.ts.map