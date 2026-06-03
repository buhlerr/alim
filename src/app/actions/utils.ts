"use server";

import { generatePassword } from "@/lib/password";

/** Generate a strong password server-side (uses Node crypto). */
export async function generatePasswordAction(): Promise<string> {
  return generatePassword();
}
