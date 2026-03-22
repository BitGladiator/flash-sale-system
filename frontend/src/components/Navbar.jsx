// frontend/src/components/Navbar.jsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap, ShoppingBag, LogOut, LogIn, Settings } from "lucide-react";

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <div className="bg-pink-600 p-1.5 rounded-lg">
            <Zap className="h-5 w-5 text-white" fill="white" />
          </div>
          <span className="text-white">FlashSale</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/"
            className="text-gray-400 hover:text-white transition-colors text-sm">
            Sales
          </Link>

          {user ? (
            <>
              {user.role === "admin" && (
                <Link to="/admin"
                  className="text-gray-400 hover:text-white transition-colors
                             text-sm flex items-center gap-1.5">
                  <Settings className="h-4 w-4" />
                  Admin
                </Link>
              )}
              <Link to="/orders"
                className="text-gray-400 hover:text-white transition-colors
                           text-sm flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4" />
                My Orders
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  {user.full_name.split(" ")[0]}
                </span>
                <button onClick={handleLogout}
                  className="text-gray-500 hover:text-red-400 transition-colors">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <Link to="/login"
              className="flex items-center gap-1.5 text-sm text-pink-400
                         hover:text-pink-300 transition-colors">
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;