import "server-only";
import { npmFetch } from "./client";
import type { NpmCertificate, LetsEncryptRequest } from "./types";

const BASE = "/nginx/certificates";

export const certificates = {
  list: () => npmFetch<NpmCertificate[]>({ path: BASE }),

  /** Request a new Let's Encrypt certificate for the given domains. */
  requestLetsEncrypt: (req: LetsEncryptRequest) =>
    npmFetch<NpmCertificate>({
      path: BASE,
      method: "POST",
      body: {
        provider: "letsencrypt",
        domain_names: req.domainNames,
        meta: {
          letsencrypt_email: req.email,
          letsencrypt_agree: true,
          dns_challenge: false,
        },
      },
    }),

  remove: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}`, method: "DELETE" }),
};
