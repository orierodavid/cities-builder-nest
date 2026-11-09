"use client";
import { useState } from "react";
import "./landing-page.css";

const roles = [
  { title: "Residents", description: "Access services, make payments and manage your account.", icon: "⌂", image: "https://residifi.com/images/nigerian-family-gate.png", alt: "Residents at their gated community" },
  { title: "Security", description: "Verify visitors and keep your estate safe.", icon: "◇", image: "https://domesticstaff.ai/_next/image?q=75&url=%2F1750073507422-mcd4k57q.webp&w=3840", alt: "Professional estate security officer" },
  { title: "Event Organisers", description: "Plan events, invite guests and manage check-in.", icon: "▦" },
  { title: "Facility Managers", description: "Oversee operations, maintenance and payments.", icon: "⚙" },
  { title: "Super Admins", description: "Manage the platform across all estates.", icon: "♛" },
];
const features = [
  ["Visitor Management", "Residents generate secure access codes. Security verifies them at the gate in seconds.", "⌑"],
  ["Service Charges & Payments", "Clear invoices, easy payments and a full payment history for every resident.", "₦"],
  ["Maintenance Requests", "Report issues, track progress and keep your estate in great shape.", "⚒"],
  ["Events & Guests", "Plan events, send invitations, check guests in and review attendance.", "▦"],
  ["Estate Announcements", "Keep the whole community informed with timely updates and notices.", "▤"],
  ["Analytics & Reports", "Get insight into payments, visitors, requests and estate performance.", "⌁"],
];
const steps = [
  ["Set Up Your Estate", "Configure your estate and add members."],
  ["Access Your Services", "Enjoy tailored services on the go."],
  ["Stay Connected", "Manage visitors, events and payments."],
  ["Monitor & Grow", "Track activities and improve management."],
];
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 11 12 3l9 8M5 10v10h14V10M10 20v-6h4v6",
    shield: "M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    bolt: "m13 2-9 12h7l-1 8 9-12h-7z",
    users: "M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20c0-4 2-6 6-6s6 2 6 6M17 9a2.5 2.5 0 1 0 0-5M16 14c3 0 5 2 5 6",
    chart: "M3 20V12h4v8M10 20V7h4v13M17 20V3h4v17",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.home} /></svg>;
}
export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return <main className="cb-landing">
    <header className={"site-header" + (menuOpen ? " menu-open" : "")}>
      <div className="container header-inner">
        <a href="/" className="logo" aria-label="CB Nest home" onClick={closeMenu}><Icon name="home" /><span className="logo-text">CB <span>Nest</span></span></a>
        <button className="nav-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mainNav" onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /></button>
        <nav className="main-nav" id="mainNav" aria-label="Main navigation"><ul>
          <li><a href="#home" onClick={closeMenu}>Home</a></li><li><a href="#about" onClick={closeMenu}>About</a></li><li><a href="#features" onClick={closeMenu}>Features</a></li>
          <li className="has-sub"><a href="#roles" onClick={closeMenu}>For Your Estate <span className="caret">⌄</span></a><ul className="sub">{roles.map(role => <li key={role.title}><a href="#roles" onClick={closeMenu}>{role.title}</a></li>)}</ul></li>
          <li><a href="#how" onClick={closeMenu}>How It Works</a></li><li><a href="#contact" onClick={closeMenu}>Contact</a></li><li className="mobile-login"><a href="/login" onClick={closeMenu}>Management Login ↗</a></li>
        </ul></nav>
        <a className="management-login" href="/login">Management Login <span>↗</span></a>
      </div>
    </header>
    <section className="hero" id="home"><div className="hero-bg" aria-hidden="true" /><div className="container hero-inner"><div className="hero-copy">
      <p className="eyebrow">Smarter Estate Management</p><h1>CB Nest — One Platform.<br />A <span className="gold">Better Living</span> Experience.</h1>
      <p className="lead">Connect residents, security, events and management with a powerful, easy-to-use platform.</p>
      <div className="hero-actions"><a className="btn-solid" href="#how">Discover How It Works ↗</a><a className="hero-link" href="/login">Management Login</a></div>
      <ul className="hero-badges"><li><Icon name="shield" /><span>Secure<br />&amp; Reliable</span></li><li><Icon name="bolt" /><span>Simple<br />&amp; Efficient</span></li><li><Icon name="users" /><span>A Connected<br />Community</span></li></ul>
    </div></div><div className="swoosh swoosh-left" /><div className="swoosh swoosh-right" /></section>
    <section className="roles" id="roles"><div className="container roles-grid"><div className="roles-intro" id="about"><p className="eyebrow dark">Built for Everyone</p><h2>A Seamless Experience for Every Role</h2><p>CB Nest offers tailored experiences for all members of your estate community.</p><span className="underline" /></div>
      <div className="role-cards">{roles.map(role => <article className="role-card" key={role.title}><div className="role-text"><span className="role-icon">{role.icon}</span><h3>{role.title}</h3><p>{role.description}</p><span className="go">↗</span></div>{role.image && <img src={role.image} alt={role.alt} loading="lazy" />}</article>)}</div>
    </div></section>
    <section className="how" id="how"><div className="container how-grid"><div className="how-intro"><p className="eyebrow">How It Works</p><h2>Simple. Secure. Effective.</h2><p>Get started in just a few steps and enjoy smarter estate management.</p><a href="#features" className="btn-outline">Discover More ↗</a></div>
      <ol className="steps">{steps.map(([title, description], i) => <li className="step" key={title}><span className="num">{i + 1}</span><Icon name={["home", "users", "shield", "chart"][i]} /><h3>{title}</h3><p>{description}</p></li>)}</ol>
    </div></section>
    <section className="features" id="features"><div className="container"><header className="section-head"><p className="eyebrow dark center">Powerful Features</p><h2>Everything You Need for Modern Estate Management</h2></header>
      <div className="feature-grid">{features.map(([title, description, icon]) => <article className="feature" key={title}><span className="f-icon">{icon}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </div></section>
    <section className="cta" id="contact"><div className="container cta-inner"><div><h2>Ready to build a better-connected estate?</h2><p>Talk to us and see how CB Nest can work for your community.</p></div><a className="btn-solid" href="mailto:hello@cbnest.com">Get in Touch ↗</a></div></section>
    <footer className="site-footer"><div className="container footer-inner"><a href="/" className="logo"><Icon name="home" /><span className="logo-text">CB <span>Nest</span></span></a><p className="tagline">Building your future. One platform, many estates.</p><p className="copy">© {new Date().getFullYear()} CB Nest. All rights reserved.</p></div></footer>
  </main>;
}
