import "./landing-page.css";

const roles = [
  { title: "Residents", description: "View service charges and payment history, generate visitor access codes, submit maintenance requests and stay informed about estate updates.", icon: "⌂" },
  { title: "Security teams", description: "Scan visitor passes, confirm the visit details and record gate entry using the security experience.", icon: "◈" },
  { title: "Event organisers", description: "Set up estate events, prepare guest lists, share invitations and manage check-in and attendance.", icon: "▦" },
  { title: "Facility managers", description: "Manage estate operations, residents, staff, service charges, maintenance and estate-wide activity.", icon: "▤" },
];

const features = [
  { title: "Visitor management", description: "Residents create access codes. Security checks the code and visit details at the gate.", icon: "⌑" },
  { title: "Service charges & payments", description: "Keep estate charges, resident contributions and payment records organised.", icon: "₦" },
  { title: "Maintenance requests", description: "Residents report issues, follow updates and reopen a request when it still needs attention.", icon: "⚒" },
  { title: "Utilities", description: "Access supported utility services, including electricity and cable TV, from the resident experience.", icon: "▦" },
  { title: "Events & invitations", description: "Organise guest lists, share invitations and coordinate event-day check-in.", icon: "◌" },
  { title: "Estate oversight", description: "Give authorised management teams visibility into residents, payments and day-to-day operations.", icon: "⌁" },
];

const steps = [
  { number: "01", title: "An estate is set up", description: "The platform administrator and authorised facility management team configure the estate and its management access." },
  { number: "02", title: "People use the tools for their role", description: "Residents, security personnel and event organisers use their own role-specific experiences. Each sees the tools relevant to their work." },
  { number: "03", title: "Everyday activity stays connected", description: "Visitor access, service charges, maintenance and events are handled through the same estate platform." },
  { number: "04", title: "Management keeps oversight", description: "Facility managers oversee their estate, while Super Admins manage the wider CB Nest platform." },
];

export default function LandingPage() {
  return (
    <main className="cb-landing">
      <header className="cb-header">
        <a className="cb-brand" href="/" aria-label="CB Nest home">
          <span className="cb-brand-mark">⌂</span>
          <span>CB NEST<small>COMMUNITY & ESTATE MANAGEMENT</small></span>
        </a>
        <nav className="cb-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#how-it-works">How it works</a>
          <a href="#who-its-for">Who it’s for</a>
          <a href="#features">Features</a>
        </nav>
        <a className="cb-login-link" href="/login">Management login <span>↗</span></a>
      </header>

      <section className="cb-hero">
        <div className="cb-hero-copy">
          <div className="cb-eyebrow"><span /> ESTATE MANAGEMENT, CONNECTED</div>
          <h1>One platform for<br />better-managed<br /><em>communities.</em></h1>
          <p className="cb-hero-text">CB Nest brings residents, security teams, event organisers and estate managers into one connected estate-management platform. It helps communities handle everyday services, access, payments and maintenance with greater clarity.</p>
          <div className="cb-hero-actions">
            <a className="cb-button cb-button-gold" href="/login">Facility Manager & Super Admin login <span>→</span></a>
            <a className="cb-text-link" href="#how-it-works">See how it works <span>↓</span></a>
          </div>
          <div className="cb-hero-note"><span className="cb-note-icon">✓</span> Separate tools for each role. One connected estate.</div>
        </div>

        <div className="cb-hero-visual" aria-label="Overview of connected CB Nest estate services">
          <div className="cb-visual-glow" />
          <div className="cb-workspace-card">
            <div className="cb-workspace-top"><div className="cb-mini-brand"><span>⌂</span> CB NEST</div><span className="cb-workspace-label">CONNECTED ESTATE SERVICES</span></div>
            <div className="cb-workspace-heading"><small>ONE ESTATE PLATFORM</small><h3>Everyday operations, in one place.</h3><p>Role-based tools for the people who live and work in the community.</p></div>
            <div className="cb-workspace-list">
              <div><span className="cb-workspace-icon">⌂</span><span><b>Resident services</b><small>Charges · Visitors · Maintenance</small></span><i>01</i></div>
              <div><span className="cb-workspace-icon">◈</span><span><b>Gate access</b><small>Visitor code · QR verification</small></span><i>02</i></div>
              <div><span className="cb-workspace-icon">▦</span><span><b>Estate events</b><small>Guest lists · Invitations · Check-in</small></span><i>03</i></div>
              <div><span className="cb-workspace-icon">▤</span><span><b>Management</b><small>People · Payments · Operations</small></span><i>04</i></div>
            </div>
            <div className="cb-workspace-footer"><span /> Connected services across your community</div>
          </div>
          <div className="cb-visual-caption">One platform. Role-specific experiences.</div>
        </div>
        <div className="cb-hero-orb cb-orb-one" /><div className="cb-hero-orb cb-orb-two" />
      </section>

      <section className="cb-trust-strip" id="platform">
        <span>RESIDENT SERVICES</span><i /><span>VISITOR ACCESS</span><i /><span>ESTATE OPERATIONS</span><i /><span>MANAGEMENT OVERSIGHT</span>
      </section>

      <section className="cb-section cb-intro">
        <div className="cb-section-kicker">WHAT IS CB NEST?</div>
        <div className="cb-intro-grid"><h2>Estate management,<br /><em>made connected.</em></h2><p>CB Nest is a platform for managing the practical work of a residential estate. It connects the people who use the estate every day with the teams responsible for access control, events and facility operations. Instead of treating each activity as a separate process, CB Nest brings these services into one coordinated system.</p></div>
      </section>

      <section className="cb-section cb-how" id="how-it-works">
        <div className="cb-section-heading"><div><div className="cb-section-kicker">HOW IT WORKS</div><h2>From daily requests<br /><em>to estate oversight.</em></h2></div><p>Each role has its own workspace and responsibilities, while activity remains connected to the right estate.</p></div>
        <div className="cb-steps-grid">{steps.map((step)=><article className="cb-step" key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div>
      </section>

      <section className="cb-section cb-roles" id="who-its-for">
        <div className="cb-section-heading"><div><div className="cb-section-kicker">DESIGNED FOR THE PEOPLE IN YOUR ESTATE</div><h2>One community.<br /><em>Purpose-built roles.</em></h2></div><p>People sign in to the experience intended for their role. This keeps the tools relevant and the responsibilities clear.</p></div>
        <div className="cb-role-grid">{roles.map((role)=><article className="cb-role-card" key={role.title}><div className="cb-role-card-top"><span className="cb-role-icon">{role.icon}</span></div><h3>{role.title}</h3><p>{role.description}</p><span className="cb-card-line" /></article>)}</div>
        <p className="cb-super-admin-note"><strong>Super Admins</strong> manage the CB Nest platform across estates through a separate authorised management role.</p>
      </section>

      <section className="cb-feature-band" id="features">
        <div className="cb-section cb-feature-inner">
          <div className="cb-feature-heading"><div className="cb-section-kicker">WHAT THE PLATFORM HELPS YOU DO</div><h2>Essential services.<br /><em>Connected in CB Nest.</em></h2><p>Practical tools for resident services, estate access and the teams keeping the community running.</p><a className="cb-button cb-button-outline" href="/login">Management login <span>→</span></a></div>
          <div className="cb-feature-grid">{features.map((feature)=><article className="cb-feature" key={feature.title}><span className="cb-feature-icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
        </div>
      </section>

      <section className="cb-management-cta">
        <div><div className="cb-section-kicker">FOR AUTHORISED ESTATE TEAMS</div><h2>Manage your estate<br /><em>with CB Nest.</em></h2><p>Sign in to the management portal to access your authorised Facility Manager or Super Admin workspace.</p></div>
        <a className="cb-button cb-button-gold" href="/login">Go to management login <span>→</span></a>
      </section>

      <footer className="cb-footer"><a className="cb-brand" href="/"><span className="cb-brand-mark">⌂</span><span>CB NEST<small>COMMUNITY & ESTATE MANAGEMENT</small></span></a><span>© {new Date().getFullYear()} CB Nest. All rights reserved.</span><a href="/login">Management login ↗</a></footer>
    </main>
  );
}
