import { NavLink, Outlet } from "react-router-dom";
import { APP_VERSION_LABEL } from "@sige/contracts";

import { getNavigationForUser } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";

export function AppShell() {
  const { user, logout } = useAuth();
  const userContext = user?.legacyTeam ?? user?.specificRole ?? user?.team ?? user?.email;
  const navigation = getNavigationForUser(user);

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
