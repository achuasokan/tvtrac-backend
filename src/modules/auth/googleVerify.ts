import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";

export const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GoogleJwtPayload {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
}

export async function verifyGoogleToken(accessToken: string): Promise<GoogleJwtPayload> {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error("Invalid Google Access Token");
    }

    const payload = await response.json() as GoogleJwtPayload;
    
    // We expect the payload to have sub (googleId), email, name, picture
    return payload;
}