export const isQuantified = (s?: string) => {
    if (!s) return false;
    const t = String(s).toLowerCase();

    return (
        /\b\d+(?:\.\d+)?\s*%/.test(t) ||                    // 12%
        /\b\d+\s*percent\b/.test(t) ||                      // 12 percent
        /(?:~?\s*)?(?:\$|usd|eur|aud|cad|gbp|₹|¥|€|£)\s?\d[\d,]*(?:\.\d+)?\s*(k|m|b|bn|million|billion)?\b/.test(t) ||
        /\b\d[\d,]*(?:\.\d+)?\s*(years?|months?|weeks?|days?|hours?|people|employees?|team(?:\s?members?)?|clients?|customers?|projects?|tickets?|leads?|users?)\b/.test(t) ||
        /\b(increased|decreased|reduced|grew|boosted|cut|saved|improved)\b.*\b\d[\d,]*(?:\.\d+)?\b/.test(t) ||
        /\b\d+(?:\.\d+)?\s*(x|×)\b/.test(t) ||              // 3x
        /\b\d[\d,]*\+\b/.test(t) ||                         // 200+
        /\b\d+(?:\.\d+)?\s*points?\b/.test(t)               // 28 points
    );
};
