import "./landing-page.css";

const roles = [
  { number: "01", title: "Residents", description: "Manage service charges, visitor access, maintenance requests and everyday estate services.", icon: "⌂" },
  { number: "02", title: "Security teams", description: "Verify visitor passes, review visit details and keep a clear record of gate activity.", icon: "◈" },
  { number: "03", title: "Event organisers", description: "Coordinate guest lists, invitations, event check-in and attendance from one workspace.", icon: "▦" },
  { number: "04", title: "Facility managers", description: "Oversee residents, staff, service charges, maintenance and estate-wide operations.", icon: "▤" },
];

const features = [
  { title: "Visitor access", description: "Generate visitor codes and verify access at the gate.", icon: "⌑" },
  { title: "Payments & service charges", description: "Keep charges, contributions and payment history organised.", icon: "₦" },
  { title: "Maintenance", description: "Track requests through resolution and reopen issues that need more attention.", icon: "⚒" },
  { title: "Utilities", description: "Access supported electricity and cable TV services.", icon: "ϟ" },
  { title: "Events", description: "Manage guest lists, invitations and event-day attendance.", icon: "◌" },
  { title: "Estate insights", description: "Give authorised teams a clearer view of activity across the estate.", icon: "⌁" },
];

const steps = [
  { number: "01", title: "Set up your estate", description: "Authorised administrators configure the estate, teams and management access." },
  { number: "02", title: "Give every role its own tools", description: "Residents, security and event teams use focused experiences built around their responsibilities." },
  { number: "03", title: "Keep operations connected", description: "Access, payments, maintenance and events stay connected to the right estate." },
];

export default function LandingPage() {
  return (
    <main className="cb-landing">
      <header className="cb-header">
        <a className="cb-brand" href="/" aria-label="CB Nest home">
          <span className="cb-brand-mark">⌂</span>
          <span className="cb-brand-name">cb<span>nest</span><small>ESTATE OPERATIONS PLATFORM</small></span>
        </a>
        <nav className="cb-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#workflow">How it works</a>
          <a href="#roles">Who it’s for</a>
          <a href="#features">Capabilities</a>
        </nav>
        <details className="cb-mobile-menu">
          <summary aria-label="Open navigation menu">Menu <span>＋</span></summary>
          <nav aria-label="Mobile navigation">
            <a href="#platform">Platform</a>
            <a href="#workflow">How it works</a>
            <a href="#roles">Who it’s for</a>
            <a href="#features">Capabilities</a>
          </nav>
        </details>
      </header>

      <section className="cb-hero" id="platform">
        <div className="cb-hero-copy">
          <div className="cb-eyebrow"><span /> THE OPERATING SYSTEM FOR BETTER-RUN ESTATES</div>
          <h1>Estate living,<br />working <em>better.</em></h1>
          <p className="cb-hero-text">One connected platform for the people who live in, protect and manage residential communities. Bring everyday estate services into a clearer, more coordinated experience.</p>
          <div className="cb-hero-actions">
            <a className="cb-button cb-button-primary" href="#workflow">Explore the platform <span>↗</span></a>
            <a className="cb-text-link" href="#features">Discover capabilities <span>↓</span></a>
          </div>
          <div className="cb-proof-row"><span className="cb-proof-dot" /> ROLE-BASED WORKSPACES <i /> ONE CONNECTED ESTATE</div>
        </div>
        <div className="cb-product-stage" aria-label="Illustration of the CB Nest estate operations platform">
          <div className="cb-stage-glow" />
          <div className="cb-product-window">
            <div className="cb-window-bar"><div className="cb-window-brand"><span>⌂</span> cbnest</div><div className="cb-window-status"><i /> ESTATE OVERVIEW</div><div className="cb-window-dots"><i /><i /><i /></div></div>
            <div className="cb-window-body">
              <aside className="cb-window-sidebar"><div className="cb-sidebar-mark">⌂</div><span className="active">▦</span><span>◈</span><span>₦</span><span>⚒</span><span>⌁</span></aside>
              <div className="cb-window-content">
                <div className="cb-window-heading"><div><small>YOUR ESTATE, AT A GLANCE</small><h3>Everything in sync.</h3><p>A connected view of daily estate operations.</p></div><div className="cb-date-chip">OVERVIEW <span>⌄</span></div></div>
                <div className="cb-metric-grid"><div><small>RESIDENT SERVICES</small><strong>Connected</strong><span className="cb-metric-line"><i style={{width:"78%"}} /></span></div><div><small>VISITOR ACCESS</small><strong>Verified</strong><span className="cb-metric-line"><i style={{width:"88%"}} /></span></div><div><small>ESTATE OPERATIONS</small><strong>In view</strong><span className="cb-metric-line"><i style={{width:"66%"}} /></span></div></div>
                <div className="cb-activity-panel"><div className="cb-panel-heading"><b>Connected services</b><span>ROLE-BASED TOOLS</span></div><div className="cb-service-row"><span className="cb-service-icon">⌂</span><div><b>Resident experience</b><small>Charges · Visitors · Requests</small></div><span className="cb-service-arrow">↗</span></div><div className="cb-service-row"><span className="cb-service-icon">◈</span><div><b>Gate access</b><small>Passes · Verification · Entry</small></div><span className="cb-service-arrow">↗</span></div><div className="cb-service-row"><span className="cb-service-icon">▦</span><div><b>Events & community</b><small>Guests · Invitations · Check-in</small></div><span className="cb-service-arrow">↗</span></div></div>
              </div>
            </div>
            <div className="cb-window-footer"><span><i /> SYSTEM OVERVIEW</span><span>CB NEST PLATFORM <b>•</b> 01 / 04</span></div>
          </div>
          <div className="cb-stage-note"><span>✳</span> One community. Every role connected.</div>
        </div>
        <div className="cb-hero-index">01 <span>/</span> 04</div>
      </section>

      <div className="cb-marquee" aria-label="Platform capabilities"><span>RESIDENT EXPERIENCE</span><i /> <span>VISITOR MANAGEMENT</span><i /> <span>ESTATE OPERATIONS</span><i /> <span>COMMUNITY SERVICES</span><i /> <span>MANAGEMENT INSIGHTS</span></div>

      <section className="cb-intro cb-section">
        <div className="cb-section-label"><span>01</span> / THE PLATFORM</div>
        <div className="cb-intro-content"><h2>Less friction in the<br /><em>everyday running</em><br />of your estate.</h2><div><p>CB Nest brings the essential work of a residential estate into one coordinated platform. Residents can access services, security can verify visitors, event teams can manage attendance and facility managers can oversee operations.</p><p className="cb-intro-secondary">Different people. Purpose-built tools. A shared view of the community.</p></div></div>
      </section>

      <section className="cb-workflow cb-section" id="workflow">
        <div className="cb-section-top"><div className="cb-section-label"><span>02</span> / THE WORKFLOW</div><p>Designed around the way an estate actually works.</p></div>
        <div className="cb-workflow-heading"><h2>One connected flow.<br /><em>Clear responsibilities.</em></h2><p>Each person gets the tools they need, while activity stays connected to the right estate.</p></div>
        <div className="cb-steps">{steps.map((step)=><article className="cb-step" key={step.number}><span className="cb-step-number">{step.number}</span><div className="cb-step-rule" /><h3>{step.title}</h3><p>{step.description}</p></article>)}</div>
      </section>

      <section className="cb-roles cb-section" id="roles">
        <div className="cb-section-top"><div className="cb-section-label"><span>03</span> / BUILT FOR EVERY ROLE</div><p>Purpose-built experiences, not one crowded interface.</p></div>
        <div className="cb-roles-heading"><h2>Everyone has<br /><em>a place here.</em></h2><p>CB Nest keeps the experience focused on each person’s role and responsibilities within the community.</p></div>
        <div className="cb-role-grid">{roles.map((role)=><article className="cb-role-card" key={role.number}><div className="cb-role-top"><span>{role.number}</span><b>{role.icon}</b></div><h3>{role.title}</h3><p>{role.description}</p><span className="cb-role-arrow">↗</span></article>)}</div>
        <div className="cb-admin-note"><span>+</span><p><b>Platform administration</b> — Super Admins oversee the wider CB Nest platform and its estates through a separate authorised workspace.</p></div>
      </section>

      <section className="cb-capabilities cb-section" id="features">
        <div className="cb-capabilities-head"><div className="cb-section-label"><span>04</span> / PLATFORM CAPABILITIES</div><h2>The moving parts<br />of estate life, <em>together.</em></h2><p>Practical services and operational tools, brought into one place.</p></div>
        <div className="cb-feature-grid">{features.map((feature,index)=><article className="cb-feature" key={feature.title}><div className="cb-feature-top"><span>{feature.icon}</span><small>0{index+1}</small></div><h3>{feature.title}</h3><p>{feature.description}</p><div className="cb-feature-line" /></article>)}</div>
      </section>

      <section className="cb-closing"><div className="cb-closing-orbit">⌂</div><div className="cb-section-label">CB NEST / CONNECTED ESTATE MANAGEMENT</div><h2>A better way to<br /><em>run the everyday.</em></h2><p>One community platform. Clearer operations for everyone.</p></section>

      <footer className="cb-footer"><a className="cb-brand" href="/" aria-label="CB Nest home"><span className="cb-brand-mark">⌂</span><span className="cb-brand-name">cb<span>nest</span><small>ESTATE OPERATIONS PLATFORM</small></span></a><span>© {new Date().getFullYear()} CB Nest</span><span>BUILT FOR CONNECTED COMMUNITIES</span></footer>
    </main>
  );
}
