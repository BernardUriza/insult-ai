/** Pre-rendered sample roast — the "what you'll get" demo proof.
 *
 * Shown on the empty home so a judge / first-time visitor sees the product's
 * OUTPUT before typing anything. Plain data — no API call required, no
 * Bright Data credit burned, no agent latency. The receipts are real public
 * URLs (IANA + RFC + Wikipedia + the target itself) so a curious user can
 * click through and verify the sample isn't fabricated chrome.
 *
 * To refresh with a real generated roast: run the agent against the same
 * target, copy the streamed output + receipts list, paste here. The shape
 * (target / text / receipts) matches what /roast returns. */
export interface SampleRoast {
  target: string;
  text: string;
  receipts: string[];
}

export const SAMPLE_ROAST: SampleRoast = {
  target: "https://example.com",
  text: `**You're a placeholder. Literally.** example.com isn't a startup — it's a domain reserved by IANA in 1992 specifically so that nobody else could use it. The receipts agree: you've existed for 34 years and your most ambitious copy is "This domain is for use in illustrative examples in documents." That's not modesty, that's a job description.

Your homepage has one paragraph, one link, and roughly the engagement of a dial tone. Meanwhile RFC 2606 immortalized you as the canonical example of nothing — the only "company" on Earth whose product spec literally says *do not assign*. Founders dream of an exit; you were retired before founders existed.

**Verdict: the most successful product in tech history at doing absolutely nothing.** Every developer on Earth has typed your URL. Zero of them came back.`,
  receipts: [
    "https://www.iana.org/domains/reserved",
    "https://datatracker.ietf.org/doc/html/rfc2606",
    "https://en.wikipedia.org/wiki/Example.com",
    "https://example.com",
  ],
};
