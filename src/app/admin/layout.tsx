import { Plus_Jakarta_Sans, Outfit } from "next/font/google";
import "./admin.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${outfit.variable}`}>{children}</div>;
}
