import type { Db } from "../db/index.js";
export type Role = "admin" | "sales_manager" | "sales_rep" | "viewer";
export interface UserRecord {
    id: string;
    email: string;
    role: string;
}
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function findUserByEmail(db: Db, email: string): Promise<UserRecord | null>;
export declare function findUserById(db: Db, id: string): Promise<UserRecord | null>;
export declare function createUser(db: Db, email: string, password: string, role?: Role): Promise<UserRecord>;
/** Reset password for a user by email. Returns the user or null. */
export declare function resetPassword(db: Db, email: string, newPassword: string): Promise<UserRecord | null>;
export declare function authenticate(db: Db, email: string, password: string): Promise<{
    user: UserRecord;
} | {
    error: string;
}>;
/** Can this role confirm actions (any user's request)? */
export declare function canConfirmActions(role: string): boolean;
/** Can this user confirm this specific action request (own request as sales_rep, or manager/admin for any)? */
export declare function canConfirmThisRequest(userRole: string, userId: string, requestCreatedByUserId: string): boolean;
/** Can this role request write actions (and get confirmation flow)? */
export declare function canRequestActions(role: string): boolean;
/** Can this role use chat (read-only at least)? */
export declare function canUseChat(role: string): boolean;
//# sourceMappingURL=index.d.ts.map