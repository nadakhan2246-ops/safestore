// mascot.js
// The original "SafeStore Guardian" mascot and a matching logo mark.
// Pure inline SVG — no external image assets, nothing copyrighted.
// Moods: happy | sleepy | excited | waving | holding | success | confused | shield

function safeStoreMascot(size, mood) {
  size = size || 80;
  mood = mood || "happy";

  let eyes, mouth, extra = "", accessory = "";

  const eyesHappy = `<circle cx="39" cy="46" r="3.6" fill="#3B2922"/><circle cx="61" cy="46" r="3.6" fill="#3B2922"/>`;
  const eyesSparkle = `
    <circle cx="39" cy="46" r="4.2" fill="#3B2922"/><circle cx="61" cy="46" r="4.2" fill="#3B2922"/>
    <circle cx="40.5" cy="44.5" r="1.2" fill="#fff"/><circle cx="62.5" cy="44.5" r="1.2" fill="#fff"/>
  `;
  const mouthSmile = `<path d="M41 56 Q50 62 59 56" stroke="#3B2922" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const mouthBigSmile = `<path d="M40 56 Q50 66 60 56" stroke="#3B2922" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const sparkles = `
    <path d="M14 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#E7C9A3"/>
    <path d="M84 60 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 z" fill="#E7C9A3"/>
  `;

  switch (mood) {
    case "sleepy":
      eyes = `
        <path d="M34 46 Q39 42 44 46" stroke="#3B2922" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M56 46 Q61 42 66 46" stroke="#3B2922" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      `;
      mouth = `<ellipse cx="50" cy="58" rx="4" ry="3" fill="#3B2922"/>`;
      extra = `<text x="72" y="30" font-size="12" fill="#A8754F" font-family="sans-serif" font-weight="700">z</text>
               <text x="80" y="20" font-size="9" fill="#A8754F" font-family="sans-serif" font-weight="700">z</text>`;
      break;

    case "excited":
      eyes = eyesSparkle; mouth = mouthBigSmile; extra = sparkles;
      break;

    case "waving":
      eyes = eyesHappy; mouth = mouthSmile;
      accessory = `
        <path d="M78 50 Q90 44 88 32" stroke="#5C3A2E" stroke-width="5" fill="none" stroke-linecap="round"/>
        <circle cx="88" cy="30" r="5.5" fill="#A8754F" stroke="#3B2922" stroke-width="1.2"/>
      `;
      break;

    case "holding":
      eyes = eyesHappy; mouth = mouthSmile;
      accessory = `
        <path d="M28 66 Q22 74 28 82" stroke="#5C3A2E" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M72 66 Q78 74 72 82" stroke="#5C3A2E" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="37" y="70" width="26" height="20" rx="2" fill="#FFF8EE" stroke="#3B2922" stroke-width="1.4"/>
        <line x1="41" y1="76" x2="59" y2="76" stroke="#5C3A2E" stroke-width="1.4"/>
        <line x1="41" y1="81" x2="59" y2="81" stroke="#5C3A2E" stroke-width="1.4"/>
        <line x1="41" y1="86" x2="52" y2="86" stroke="#5C3A2E" stroke-width="1.4"/>
      `;
      break;

    case "success":
      eyes = eyesSparkle; mouth = mouthBigSmile; extra = sparkles;
      accessory = `
        <circle cx="78" cy="70" r="13" fill="#5F7A61" stroke="#FFF8EE" stroke-width="2"/>
        <path d="M72 70 l4 4 8 -8" stroke="#FFF8EE" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      break;

    case "confused":
      eyes = `<circle cx="39" cy="47" r="3.2" fill="#3B2922"/><circle cx="61" cy="45" r="4.2" fill="#3B2922"/>`;
      mouth = `<path d="M42 58 Q50 54 58 58" stroke="#3B2922" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
      extra = `<text x="66" y="26" font-size="16" fill="#A8754F" font-family="sans-serif" font-weight="800">?</text>`;
      break;

    case "shield":
      eyes = eyesHappy; mouth = mouthSmile;
      accessory = `
        <path d="M50 66 C60 66 66 70 66 70 L66 84 C66 94 58 100 50 104 C42 100 34 94 34 84 L34 70 C34 70 40 66 50 66 Z"
              fill="#5F7A61" stroke="#3B2922" stroke-width="1.4" transform="translate(0,-10) scale(0.72)" transform-origin="50 85"/>
        <path d="M46.5 84 l3 3 6 -6" stroke="#FFF8EE" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-10) scale(0.72)" transform-origin="50 85"/>
      `;
      break;

    default: // happy
      eyes = eyesHappy; mouth = mouthSmile;
  }

  return `
    <svg class="mascot" width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SafeStore Guardian mascot">
      <defs>
        <linearGradient id="mascotBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#A8754F"/>
          <stop offset="100%" stop-color="#5C3A2E"/>
        </linearGradient>
      </defs>
      ${extra}
      <path d="M50 10 C70 10 82 18 82 18 L82 46 C82 68 68 82 50 92 C32 82 18 68 18 46 L18 18 C18 18 30 10 50 10 Z"
            fill="url(#mascotBody)" stroke="#3B2922" stroke-width="1.5"/>
      <path d="M50 18 C65 18 74 24 74 24 L74 46 C74 62 63 73 50 81 C37 73 26 62 26 46 L26 24 C26 24 35 18 50 18 Z"
            fill="#FFF8EE" opacity="0.14"/>
      <circle cx="34" cy="52" r="4" fill="#C58B45" opacity="0.5"/>
      <circle cx="66" cy="52" r="4" fill="#C58B45" opacity="0.5"/>
      ${eyes}
      ${mouth}
      <rect x="43" y="30" width="14" height="10" rx="2" fill="#FFF8EE" opacity="0.85"/>
      <line x1="46" y1="34" x2="54" y2="34" stroke="#5C3A2E" stroke-width="1.2"/>
      <line x1="46" y1="37" x2="54" y2="37" stroke="#5C3A2E" stroke-width="1.2"/>
      ${accessory}
    </svg>
  `;
}

// A simplified badge-style logo mark (document + shield, no face) for use
// in the sidebar, topbar, and favicon, where a full mascot face would be
// too busy at small sizes.
function safeStoreLogo(size) {
  size = size || 40;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SafeStore logo">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#A8754F"/>
          <stop offset="100%" stop-color="#4A2C20"/>
        </linearGradient>
      </defs>
      <path d="M32 4 C44 4 52 9 52 9 L52 28 C52 43 44 53 32 60 C20 53 12 43 12 28 L12 9 C12 9 20 4 32 4 Z"
            fill="url(#logoGrad)" stroke="#3B2922" stroke-width="1.5"/>
      <rect x="23" y="20" width="18" height="22" rx="2" fill="#FFF8EE"/>
      <line x1="27" y1="26" x2="37" y2="26" stroke="#5C3A2E" stroke-width="1.6"/>
      <line x1="27" y1="31" x2="37" y2="31" stroke="#5C3A2E" stroke-width="1.6"/>
      <line x1="27" y1="36" x2="33" y2="36" stroke="#5C3A2E" stroke-width="1.6"/>
    </svg>
  `;
}

// Data-URI favicon built from the same logo mark (no external file needed).
function safeStoreFaviconDataUri() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <path d='M32 4 C44 4 52 9 52 9 L52 28 C52 43 44 53 32 60 C20 53 12 43 12 28 L12 9 C12 9 20 4 32 4 Z' fill='%234A2C20'/>
    <rect x='23' y='20' width='18' height='22' rx='2' fill='%23FFF8EE'/>
    <line x1='27' y1='26' x2='37' y2='26' stroke='%235C3A2E' stroke-width='2'/>
    <line x1='27' y1='31' x2='37' y2='31' stroke='%235C3A2E' stroke-width='2'/>
    <line x1='27' y1='36' x2='33' y2='36' stroke='%235C3A2E' stroke-width='2'/>
  </svg>`;
  return `data:image/svg+xml,${svg.replace(/\s+/g, " ").trim()}`;
}

function applySafeStoreFavicon() {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = safeStoreFaviconDataUri();
}
