import type { Lang } from "./types";
type Dict = Record<string, string>;
const en: Dict = {
  "nav.overview": "Overview", "nav.ghats": "Ghat Explorer", "nav.analytics": "Analytics & Trends", "nav.prioritization": "Site Prioritization",
  "nav.intelligence": "AI Intelligence", "nav.cases": "Field Cases", "nav.reports": "Reports", "nav.citizen": "Citizen Guide",
  "nav.methodology": "Data & Methodology", "nav.settings": "Settings / API Status", "nav.team": "Team", "nav.messages": "Messages", "nav.mycases": "My cases", "nav.status": "System status", "nav.map": "Map", "nav.uploads": "Uploads",
  "tagline": "Environmental Intelligence. Evidence. Action.", "demo": "Demo", "connected": "API connected", "offline": "API unreachable",
  "coverage": "Historical dataset", "citizen.title": "Citizen guide", "common.retry": "Retry",
};
const hi: Dict = {
  "nav.overview": "अवलोकन", "nav.ghats": "घाट एक्सप्लोरर", "nav.analytics": "विश्लेषण और रुझान", "nav.prioritization": "स्थल प्राथमिकता",
  "nav.intelligence": "एआई सहायक", "nav.cases": "क्षेत्र मामले", "nav.reports": "रिपोर्ट", "nav.citizen": "नागरिक मार्गदर्शिका",
  "nav.methodology": "डेटा और पद्धति", "nav.settings": "सेटिंग्स / एपीआई स्थिति", "nav.team": "टीम", "nav.messages": "संदेश", "nav.mycases": "मेरे मामले", "nav.status": "सिस्टम स्थिति", "nav.map": "नक्शा", "nav.uploads": "अपलोड",
  "tagline": "पर्यावरणीय बुद्धिमत्ता। साक्ष्य। कार्रवाई।", "demo": "डेमो", "connected": "एपीआई जुड़ा है", "offline": "एपीआई उपलब्ध नहीं",
  "coverage": "ऐतिहासिक डेटा", "citizen.title": "नागरिक मार्गदर्शिका", "common.retry": "पुनः प्रयास करें",
};
const DICTS: Record<Lang, Dict> = { en, hi };
export const translate = (lang: Lang, key: string) => DICTS[lang][key] ?? en[key] ?? key;
