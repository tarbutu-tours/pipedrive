export declare const config: {
    port: number;
    nodeEnv: string;
    databaseUrl: string;
    pipedrive: {
        apiToken: string;
        domain: string;
    };
    sessionSecret: string;
    rateLimitChat: number;
    rateLimitConfirm: number;
    /** Daily report: Excel with available rooms, sent at 9:00. */
    report: {
        email: string;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: boolean;
        smtpUser: string;
        smtpPass: string;
    };
};
//# sourceMappingURL=config.d.ts.map