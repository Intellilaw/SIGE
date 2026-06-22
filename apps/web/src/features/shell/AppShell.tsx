import { NavLink, Outlet } from "react-router-dom";
import { APP_VERSION_LABEL, buildDisplayName } from "@sige/contracts";

import { getNavigationForUser } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "../modules/ModuleAvailabilityContext";

function looksLikeHandle(value: string) {
  return /[@._-]/.test(value);
}

function getSidebarUserName(user: ReturnType<typeof useAuth>["user"]) {
  const displayName = user?.displayName?.trim();
  const username = user?.username?.trim();
  const email = user?.email?.trim();

  if (displayName && !looksLikeHandle(displayName)) {
    return displayName;
  }

  return buildDisplayName(username || displayName || email || "Usuario");
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { disabledModuleIds } = useModuleAvailability();
  const sidebarUserName = getSidebarUserName(user);
  const navigation = getNavigationForUser(user, disabledModuleIds);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="nav-section">
          <nav className="nav-list">
            {navigation.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.path === "/app"} className="nav-link">
                <span className="nav-link-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.path === "/app" ? (
                  <span className="nav-link-content nav-link-content-version">
                    <span className="nav-link-label">{item.label}</span>
                    <span className="app-version-badge app-version-badge-sidebar">{APP_VERSION_LABEL}</span>
                  </span>
                ) : (
                  <span className="nav-link-label">{item.label}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="user-card">
          <strong>{sidebarUserName}</strong>
          {user?.organizationName ? <span>{user.organizationName}</span> : null}
          <button type="button" onClick={logout}>
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
