import { createHmac, timingSafeEqual } from "node:crypto";

interface SessionPayload {
  sub: string;
  email: string;
  exp: number;
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export class SessionTokenService {
  constructor(private readonly secret: string) {}

  sign(input: { userId: string; email: string; ttlSeconds?: number }): string {
    const payload: SessionPayload = {
      sub: input.userId,
      email: input.email,
      exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 60 * 60 * 24 * 30),
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = this.signValue(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  verify(token: string): SessionPayload | null {
    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = this.signValue(encodedPayload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expectedSignature);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  }

  private signValue(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}

