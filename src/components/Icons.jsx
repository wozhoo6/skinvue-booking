import React from 'react';

// skinvue line icon set, the bottom-nav glyphs and the brand mark
function Icon({ name, size = 20 }) {
  // Soft, minimalist line set: one stroke weight, rounded caps/joins and
  // rounded corners on every shape (2px radius on a 24px grid).
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (name === 'menu') {
    return (
      <svg {...common}>
        {/* Brand mark: one big S, a separate upside-down u above its right
            half and a separate u below its left half. Symmetric under a
            180° rotation about the center; every corner is a 2.5 radius. */}
        <path d="M10 6a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 7.5v2A2.5 2.5 0 0 0 6.5 12h11a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 1-2.5 2.5H15a1 1 0 0 1-1-1" />
        <path d="M20 7.5A2.5 2.5 0 0 0 17.5 5h-1A2.5 2.5 0 0 0 14 7.5" />
        <path d="M4 16.5A2.5 2.5 0 0 0 6.5 19h1a2.5 2.5 0 0 0 2.5-2.5" />
      </svg>
    );
  }

  if (name === 'close') {
    return (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }

  if (name === 'arrow') {
    return (
      <svg {...common}>
        <path d="m15 6-6 6 6 6" />
      </svg>
    );
  }

  if (name === 'chevron') {
    return (
      <svg {...common}>
        <path d="m9 6 6 6-6 6" />
      </svg>
    );
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M4 11h16" />
        <path d="M8 15h.01M12 15h.01M16 15h.01" />
      </svg>
    );
  }

  if (name === 'heart') {
    return (
      <svg {...common}>
        <path d="M19.5 12.57 12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.57" />
      </svg>
    );
  }

  if (name === 'share') {
    return (
      <svg {...common}>
        <path d="M8 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1" />
        <path d="M12 14V3M9 6l3-3 3 3" />
      </svg>
    );
  }

  if (name === 'document') {
    return (
      <svg {...common}>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    );
  }

  if (name === 'scan') {
    return (
      <svg {...common}>
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <circle cx="12" cy="10" r="2" />
        <path d="M8 16a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2" />
      </svg>
    );
  }

  if (name === 'conditions') {
    return (
      <svg {...common}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M5 6h.01M5 12h.01M5 18h.01" />
      </svg>
    );
  }

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="m4 11 6.7-6.03a2 2 0 0 1 2.6 0L20 11" />
        <path d="M6 9.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.5" />
        <path d="M10 20v-4a2 2 0 0 1 4 0v4" />
      </svg>
    );
  }

  if (name === 'camera') {
    return (
      <svg {...common}>
        <path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    );
  }

  if (name === 'contact') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }

  if (name === 'at') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.88" />
      </svg>
    );
  }

  if (name === 'user') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (name === 'message') {
    return (
      <svg {...common}>
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }

  if (name === 'arrow-right') {
    return (
      <svg {...common}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }

  if (name === 'download') {
    return (
      <svg {...common}>
        <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
        <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
      </svg>
    );
  }

  if (name === 'refresh') {
    return (
      <svg {...common}>
        <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
        <path d="M20 4v4.5h-4.5" />
        <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
        <path d="M4 20v-4.5h4.5" />
      </svg>
    );
  }

  if (name === 'external') {
    return (
      <svg {...common}>
        <path d="M14 4h6v6M20 4l-8.5 8.5" />
        <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
      </svg>
    );
  }

  if (name === 'alert') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
    );
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  }

  if (name === 'sun') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    );
  }

  if (name === 'flash-off') {
    return (
      <svg {...common}>
        <path d="M13 3 6 13h5l-1 8 4.5-6.5M16.5 11H18l-2.2 3.2" />
        <path d="m4 4 16 16" />
      </svg>
    );
  }

  if (name === 'focus') {
    return (
      <svg {...common}>
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }

  if (name === 'image') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m20 15-4-4-8 9" />
      </svg>
    );
  }

  if (name === 'key') {
    return (
      <svg {...common}>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
      </svg>
    );
  }

  if (name === 'copy') {
    return (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </svg>
    );
  }

  if (name === 'dashboard') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="8" rx="1.5" />
        <rect x="14" y="4" width="6" height="4" rx="1.5" />
        <rect x="14" y="12" width="6" height="8" rx="1.5" />
        <rect x="4" y="16" width="6" height="4" rx="1.5" />
      </svg>
    );
  }

  if (name === 'star') {
    return (
      <svg {...common}>
        <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
      </svg>
    );
  }

  if (name === 'pin') {
    return (
      <svg {...common}>
        <path d="M19 10c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (name === 'locate') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }

  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </svg>
    );
  }

  if (name === 'phone') {
    return (
      <svg {...common}>
        <path d="M8.5 4H6a2 2 0 0 0-2 2.2A16 16 0 0 0 17.8 20a2 2 0 0 0 2.2-2v-2.5a1.5 1.5 0 0 0-1.1-1.4l-2.6-.8a1.5 1.5 0 0 0-1.5.4l-1 1a12 12 0 0 1-5.5-5.5l1-1a1.5 1.5 0 0 0 .4-1.5l-.8-2.6A1.5 1.5 0 0 0 8.5 4Z" />
      </svg>
    );
  }

  if (name === 'globe') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z" />
      </svg>
    );
  }

  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }

  // 'consult' (and fallback): stethoscope
  return (
    <svg {...common}>
      <path d="M6 4H5a2 2 0 0 0-2 2v3.5a5.5 5.5 0 0 0 11 0V6a2 2 0 0 0-2-2h-1" />
      <path d="M8 15a6 6 0 1 0 12 0v-3" />
      <path d="M11 3v2M6 3v2" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

// Bottom-nav glyphs: thin outlines at rest, solid fills with cut-out details
// when active. Cut-outs are drawn in the bar's white so no mask ids are needed.
function NavIcon({ name, active = false, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  const outline = { ...common, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  const cut = { fill: 'none', stroke: '#fff', strokeWidth: 1.6 };

  if (name === 'home') {
    return active ? (
      <svg {...common} fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10.7 3.97a2 2 0 0 1 2.6 0l6 5.4a2 2 0 0 1 .7 1.49V18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7.14a2 2 0 0 1 .7-1.49l6-5.4ZM10 21v-3.5a2 2 0 0 1 4 0V21Z"
        />
      </svg>
    ) : (
      <svg {...outline}>
        <path d="M10.7 3.97a2 2 0 0 1 2.6 0l6 5.4a2 2 0 0 1 .7 1.49V18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7.14a2 2 0 0 1 .7-1.49Z" />
        <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
      </svg>
    );
  }

  if (name === 'conditions') {
    return active ? (
      <svg {...common} fill="currentColor">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <path {...cut} d="M10.5 8.5h5M10.5 12h5M10.5 15.5h5M8 8.5h.01M8 12h.01M8 15.5h.01" />
      </svg>
    ) : (
      <svg {...outline}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <path d="M10.5 8.5h5M10.5 12h5M10.5 15.5h5M8 8.5h.01M8 12h.01M8 15.5h.01" />
      </svg>
    );
  }

  if (name === 'contact') {
    return active ? (
      <svg {...common} fill="currentColor">
        <rect x="3" y="5" width="18" height="14" rx="3.5" />
        <path {...cut} d="m6.5 9 5.5 3.75L17.5 9" />
      </svg>
    ) : (
      <svg {...outline}>
        <rect x="3" y="5" width="18" height="14" rx="3.5" />
        <path d="m6.5 9 5.5 3.75L17.5 9" />
      </svg>
    );
  }

  if (name === 'dashboard') {
    return (
      <svg {...(active ? { ...common, fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.5 } : outline)}>
        <rect x="4" y="4" width="6.5" height="8.5" rx="2" />
        <rect x="13.5" y="4" width="6.5" height="4.5" rx="2" />
        <rect x="13.5" y="11.5" width="6.5" height="8.5" rx="2" />
        <rect x="4" y="15.5" width="6.5" height="4.5" rx="2" />
      </svg>
    );
  }

  if (name === 'menu') {
    // brand mark has no solid form, so the active state just thickens the line
    return (
      <svg {...outline} strokeWidth={active ? 2.1 : 1.5}>
        <path d="M10 6a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 7.5v2A2.5 2.5 0 0 0 6.5 12h11a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 1-2.5 2.5H15a1 1 0 0 1-1-1" />
        <path d="M20 7.5A2.5 2.5 0 0 0 17.5 5h-1A2.5 2.5 0 0 0 14 7.5" />
        <path d="M4 16.5A2.5 2.5 0 0 0 6.5 19h1a2.5 2.5 0 0 0 2.5-2.5" />
      </svg>
    );
  }

  // 'calendar'
  return active ? (
    <svg {...common} fill="currentColor">
      <rect x="4" y="5" width="16" height="16" rx="3.5" />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M8.5 3v3M15.5 3v3" />
      <path {...cut} d="M4.5 10h15M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" />
    </svg>
  ) : (
    <svg {...outline}>
      <rect x="4" y="5" width="16" height="16" rx="3.5" />
      <path d="M8.5 3v3M15.5 3v3M4 10h16M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" />
    </svg>
  );
}

function IconButton({ label, children, active = false, className, onClick, ...rest }) {
  return (
    <button
      className={`mh-icon-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      type="button"
      aria-label={label}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

function LogoMark() {
  return (
    <svg className="mp-logo-mark" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M4 13V9a5 5 0 0 1 5-5h4M27 4h4a5 5 0 0 1 5 5v4M36 27v4a5 5 0 0 1-5 5h-4M13 36H9a5 5 0 0 1-5-5v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M13 28c1.5-4 4-6 7-6s5.5 2 7 6"
        fill="none"
        stroke="#8fd1a0"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { Icon, NavIcon, IconButton, LogoMark };
