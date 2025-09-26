export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  sheetId: string;
  emailLabel: string;
  refreshToken?: string;
  accessToken?: string;
  tokenExpiry?: number;
  createdAt: Date;
  lastProcessed?: Date;
  isActive: boolean;
}
