import { NavLink, Outlet } from "react-router-dom";
import { APP_VERSION_LABEL, APP_VERSION_TEXT } from "@sige/contracts";

import { appModules } from "../../config/modules";
import { navigation } from "../../config/navigation";
import { useAuth } from "../auth/AuthContext";
import { canReadAppHome, canReadModule } from "../auth/permissions";

export function AppShell() {
  const { user, logout } = useAuth();
  const userContext = user?.legacyTeam ?? user?.specificRole ?? user?.team ?? user?.email;
  const visibleNavigation = navigation.filter((item) => {
    if (item.path === "/app") {
      return canReadAppHome(user);
    }

    const module = appModules.find((candidate) => candidate.path === item.path);
    return module ? canReadModule(user, module.id) : false;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="nav-section">
          <nav className="nav-list">
            {visibleNavigation.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.path === "/app"} className="nav-link">
                <span className="nav-link-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.path === "/app" ? (
                  <span className="app-version-badge app-version-badge-sidebar" aria-label={APP_VERSION_TEXT} title={APP_VERSION_TEXT}>
                    {APP_VERSION_LABEL}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="user-card">
          <strong>{user?.displayName}</strong>
          <span>{userContext}</span>
          <small>@{user?.username}</small>
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
