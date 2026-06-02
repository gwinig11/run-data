import "./globals.css";

export const metadata = {
  title: "FIT Activity Dashboard",
  description: "Latest FIT activity summary from Make.com uploads.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
