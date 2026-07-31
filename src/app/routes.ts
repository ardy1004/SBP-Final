import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  layout("./components/Layout.tsx", [
    // Homepage — pilot SSR dengan loader (Tugas 1 Fase E)
    index("./routes/home.tsx"),

    // Listing — SSR via loader D1 (routes/properties.tsx) untuk SEO/GEO
    route("properties", "./routes/properties.tsx", { id: "properties-page" }),
    route("dijual/:jenis/:provinsi/:kabupaten/:kecamatan/:slug", "./routes/property-detail.tsx", { id: "dijual-detail" }),
    route("disewa/:jenis/:provinsi/:kabupaten/:kecamatan/:slug", "./routes/property-detail.tsx", { id: "disewa-detail" }),
    route(":slug", "./routes/properties.tsx", { id: "programmatic-seo" }),   // /rumah-dijual-jogja (slug tak valid → 404)
    route("about", "./components/AboutPage.tsx"),
    route("portfolio", "./components/PortfolioPage.tsx"),
    route("blog", "./routes/blog.tsx"),
    route("blog/:slug", "./routes/blog-detail.tsx", { id: "blog-detail" }),
    route("faq", "./components/FAQPage.tsx"),
    route("contact", "./components/ContactPage.tsx"),
    route("notaris", "./components/NotarisPage.tsx"),
    route("privacy", "./components/PrivacyPage.tsx"),
    route("titip-jual/*", "./components/TitipJualPage.tsx"),
    route("sign/:token", "./components/SignPage.tsx"),
  ]),

  // Admin — CSR saja (tidak perlu SSR).
  // Route yang menunjuk ke ./routes/admin/* dibungkus src/app/lib/clientOnly.tsx
  // supaya grafnya TIDAK ikut dievaluasi saat startup Worker (penyebab Error 1102
  // pada 2026-07-25). Route admin baru WAJIB mengikuti pola yang sama.
  route("admin/login", "./routes/admin/login.tsx"),
  layout("./routes/admin/layout.tsx", [
    route("admin", "./routes/admin/overview.tsx"),
    route("admin/agreements", "./routes/admin/agreements.tsx", { id: "admin-agreements" }),
    route("admin/agreements/:id", "./routes/admin/agreement-detail.tsx", { id: "admin-agreement-detail" }),
    route("admin/listing", "./routes/admin/listing.tsx"),
    route("admin/listing/:id", "./routes/admin/property-detail.tsx", { id: "admin-property-detail" }),
    route("admin/viralframe", "./routes/admin/viralframe.tsx", { id: "admin-viralframe" }),
    route("admin/viralframe/agent-videos", "./routes/admin/viralframe-agent-videos.tsx", { id: "admin-viralframe-agent-videos" }),
    route("admin/viralframe/:id", "./routes/admin/viralframe-workspace.tsx", { id: "admin-viralframe-workspace" }),
    route("admin/leads", "./routes/admin/leads.tsx"),
    route("admin/leads/:id", "./routes/admin/lead-detail.tsx", { id: "admin-lead-detail" }),
    route("admin/testimoni", "./routes/admin/testimoni.tsx", { id: "admin-testimoni" }),
    route("admin/blog", "./routes/admin/blog.tsx", { id: "admin-blog" }),
    route("admin/portfolio", "./routes/admin/placeholder.tsx", { id: "admin-portfolio" }),
    route("admin/media", "./routes/admin/placeholder.tsx", { id: "admin-media" }),
    route("admin/pengaturan", "./routes/admin/pengaturan.tsx", { id: "admin-pengaturan" }),
    route("admin/lokasi", "./routes/admin/lokasi.tsx"),
    route("admin/errors", "./routes/admin/errors.tsx", { id: "admin-errors" }),
  ]),

  route("*", "./components/NotFoundPage.tsx"),
] satisfies RouteConfig;
