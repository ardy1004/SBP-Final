import { createBrowserRouter } from 'react-router';
import Layout from './components/Layout';
import HomePage from './components/HomePage';
import PropertiesPage from './components/PropertiesPage';
import PropertyDetailPage from './components/PropertyDetailPage';
import AboutPage from './components/AboutPage';
import PortfolioPage from './components/PortfolioPage';
import BlogPage from './components/BlogPage';
import FAQPage from './components/FAQPage';
import ContactPage from './components/ContactPage';
import NotarisPage from './components/NotarisPage';
import PrivacyPage from './components/PrivacyPage';
import TitipJualPage from './components/TitipJualPage';
import SignPage from './components/SignPage';
import AdminLoginPage from './components/admin/AdminLoginPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminOverviewPage from './components/admin/AdminOverviewPage';
import AdminListingPage from './components/admin/AdminListingPage';
import AdminLeadsPage from './components/admin/AdminLeadsPage';
import NotFoundPage from './components/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: 'properties', Component: PropertiesPage },
      { path: 'dijual/:jenis/:provinsi/:kabupaten/:kecamatan/:slug', Component: PropertyDetailPage },
      { path: 'disewa/:jenis/:provinsi/:kabupaten/:kecamatan/:slug', Component: PropertyDetailPage },
      { path: ':jenis-dijual-:lokasi', Component: PropertiesPage },
      { path: 'about', Component: AboutPage },
      { path: 'portfolio', Component: PortfolioPage },
      { path: 'blog', Component: BlogPage },
      { path: 'faq', Component: FAQPage },
      { path: 'contact', Component: ContactPage },
      { path: 'notaris', Component: NotarisPage },
      { path: 'privacy', Component: PrivacyPage },
      { path: 'titip-jual/*', Component: TitipJualPage },
      { path: 'sign/:token', Component: SignPage },
    ],
  },
  { path: '/admin/login', Component: AdminLoginPage },
  {
    path: '/admin',
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminOverviewPage },
      { path: 'listing', Component: AdminListingPage },
      { path: 'leads', Component: AdminLeadsPage },
    ],
  },
  { path: '*', Component: NotFoundPage },
]);
