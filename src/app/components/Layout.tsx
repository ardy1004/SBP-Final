import { Outlet } from 'react-router';
import Navbar from './Navbar';
import Footer from './Footer';
import CookieBanner from './CookieBanner';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
