const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/kitchen", label: "Kitchen" },
  { href: "/admin/inventory", label: "Inventory" }
];

export function AdminTabs({ active, onNavigate }: { active: string; onNavigate: (path: string) => void }) {
  return (
    <nav className="admin-tabs" aria-label="Operations sections">
      {TABS.map((tab) => (
        <a key={tab.href} href={tab.href} className={active === tab.href ? "active" : ""} aria-current={active === tab.href ? "page" : undefined} onClick={(event) => { event.preventDefault(); onNavigate(tab.href); }}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
