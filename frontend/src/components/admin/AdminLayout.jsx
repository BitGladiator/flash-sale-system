import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Package, Zap,
  ShoppingBag, Users, LogOut, ArrowLeft,
} from 'lucide-react';

const navItems = [
  { to: '/admin',          label: 'Dashboard',  icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products',   icon: Package },
  { to: '/admin/sales',    label: 'Sales',      icon: Zap },
  { to: '/admin/orders',   label: 'Orders',     icon: ShoppingBag },
  { to: '/admin/users',    label: 'Users',      icon: Users },
];

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-gray-900 border-r border-gray-800
                        flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="bg-pink-600 p-1.5 rounded-lg">
              <Zap className="h-4 w-4 text-white" fill="white" />
            </div>
            <span className="text-white">Admin Panel</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {user?.email}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                 font-medium transition-colors
                 ${isActive
                   ? 'bg-pink-600/20 text-pink-400 border border-pink-600/30'
                   : 'text-gray-400 hover:text-white hover:bg-gray-800'}`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-1">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                       text-sm text-gray-400 hover:text-white
                       hover:bg-gray-800 w-full transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Store
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                       text-sm text-gray-400 hover:text-red-400
                       hover:bg-red-900/20 w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;