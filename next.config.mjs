/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingIncludes: { "/**": ["./data/catalog.json"] },
};
export default nextConfig;
