export const generateUsername = (name: string): string => {
  const baseUsername = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  const random = Math.floor(1000 + Math.random() * 9000);

  return `${baseUsername}${random}`;
};