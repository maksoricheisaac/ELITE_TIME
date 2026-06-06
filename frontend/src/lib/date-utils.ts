
export function formatDateFR(date: Date): string {
  const dateStr = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Mettre la première lettre de chaque mot en majuscule
  return dateStr
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
