/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "nodemailer"],
  outputFileTracingIncludes: { "/**": ["./data/catalog.json"] },
};
export default nextConfig;
