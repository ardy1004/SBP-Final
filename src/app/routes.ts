import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  layout("./components/Layout.tsx", [
    // Homepage — pilot SSR dengan loader (Tugas 1 Fase E)
    index("./routes/home.tsx"),

    // Halaman publik — belum ada loader, render loading-state server-side (aman, hydrate client)
    route("properties", "./components/PropertiesPage.tsx", { id: "properties-page" }),
    route("dijual/:jenis/:provinsi/:kabupaten/:kecamatan/:slug", "./routes/property-detail.tsx", { id: "dijual-detail" }),
    route("disewa/:jenis/:provinsi/:kabupaten/:kecamatan/:slug", "./routes/property-detail.tsx", { id: "disewa-detail" }),
    route(":slug", "./components/PropertiesPage.tsx", { id: "programmatic-seo" }),   // /rumah-dijual-jogja
    route("about", "./components/AboutPage.tsx"),
    route("portfolio", "./components/PortfolioPage.tsx"),
    route("blog", "./components/BlogPage.tsx"),
    route("faq", "./components/FAQPage.tsx"),
    route("contact", "./components/ContactPage.tsx"),
    route("notaris", "./components/NotarisPage.tsx"),
    route("privacy", "./components/PrivacyPage.tsx"),
    route("titip-jual/*", "./components/TitipJualPage.tsx"),
    route("sign/:token", "./components/SignPage.tsx"),
  ]),

  // Admin — CSR saja (tidak perlu SSR)
  route("admin/login", "./components/admin/AdminLoginPage.tsx"),
  layout("./components/admin/AdminLayout.tsx", [
    route("admin", "./components/admin/AdminOverviewPage.tsx"),
    route("admin/agreements", "./components/admin/AdminAgreementsPage.tsx", { id: "admin-agreements" }),
    route("admin/agreements/:id", "./components/admin/AdminAgreementDetailPage.tsx", { id: "admin-agreement-detail" }),
    route("admin/listing", "./components/admin/AdminListingPage.tsx"),
    route("admin/listing/:id", "./components/admin/AdminPropertyDetailPage.tsx", { id: "admin-property-detail" }),
    route("admin/leads", "./components/admin/AdminLeadsPage.tsx"),
    route("admin/testimoni", "./components/admin/AdminTestimoniPage.tsx", { id: "admin-testimoni" }),
    route("admin/blog", "./components/admin/AdminPlaceholderPage.tsx", { id: "admin-blog" }),
    route("admin/portfolio", "./components/admin/AdminPlaceholderPage.tsx", { id: "admin-portfolio" }),
    route("admin/media", "./components/admin/AdminPlaceholderPage.tsx", { id: "admin-media" }),
    route("admin/pengaturan", "./components/admin/AdminPlaceholderPage.tsx", { id: "admin-pengaturan" }),
  ]),

  route("*", "./components/NotFoundPage.tsx"),
] satisfies RouteConfig;
