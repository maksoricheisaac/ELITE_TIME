/**
 * Transition entre pages : un fondu très court (180 ms) sur le contenu seulement.
 * Le layout (sidebar, en-tête) persiste ; seul le contenu est remplacé, sans animation spectaculaire.
 * Sous prefers-reduced-motion : fondu pur, sans déplacement (voir app/motion.css).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col gap-4 sm:gap-6">{children}</div>
}
