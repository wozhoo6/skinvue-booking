import React, { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { NavIcon, LogoMark } from './Icons';
import './css/SiteShell.css';

const navLinkClass = (base) => ({ isActive }) => `${base}${isActive ? ' is-active' : ''}`;

function Brand({ className }) {
  return (
    <Link to="/" className={className} aria-label="skinvue home">
      <LogoMark />
      <span>skinvue</span>
    </Link>
  );
}

// Desktop top bar (hidden below 769px, where the bottom nav takes over)
function SiteHeader() {
  return (
    <header className="sv-header">
      <div className="sv-header-inner">
        <Brand className="sv-brand" />

        <nav className="sv-nav" aria-label="Main">
          <NavLink to="/" end className={navLinkClass('sv-nav-link')}>Home</NavLink>
          <NavLink to="/contact" className={navLinkClass('sv-nav-link')}>Contact</NavLink>
        </nav>
      </div>
    </header>
  );
}

// Desktop footer (hidden below 769px)
function SiteFooter() {
  return (
    <footer className="sv-footer">
      <div className="sv-footer-inner">
        <div className="sv-footer-about">
          <Brand className="sv-brand sv-brand--small" />
        </div>

        <nav className="sv-footer-links" aria-label="Footer">
          <Link to="/contact">Contact</Link>
        </nav>
      </div>
      <p className="sv-footer-copy">© {new Date().getFullYear()} skinvue</p>
    </footer>
  );
}

// Phone top bar (hidden at 769px and up, where the header takes over)
function MobileTopbar() {
  return (
    <header className="mp-topbar">
      <div className="mp-brand">
        <LogoMark />
        <span>skinvue</span>
      </div>
    </header>
  );
}

// Floating bottom bar on phones. The active tab follows the URL.
function MobileBottomNav() {
  const navTab = (to, icon, label) => (
    <NavLink to={to} end className={navLinkClass('mp-nav-tab')}>
      {({ isActive }) => (
        <>
          <NavIcon name={icon} active={isActive} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <nav className="mp-nav" aria-label="Bottom navigation">
      {navTab('/', 'home', 'Home')}
      {navTab('/contact', 'contact', 'Contact')}
    </nav>
  );
}

// Page frame for every skinvue screen: desktop header/footer or the phone top
// bar and bottom nav (switched in CSS). `fill` lets the page stretch to the
// bottom nav on phones (contact view).
function SiteShell({ children, className = '', fill = false }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={`mp-shell${className ? ` ${className}` : ''}`}>
      <SiteHeader />

      <main className={`mp-canvas${fill ? ' mp-canvas--fill' : ''}`}>
        <MobileTopbar />
        {children}
      </main>

      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}

export default SiteShell;
