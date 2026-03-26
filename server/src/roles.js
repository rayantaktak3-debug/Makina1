export const ROLES = {
  BUSINESS_MAN: "Business Man",
  TERRORIST: "Terrorist",
  POLITICIAN: "Politician",
  THIEF: "Thief",
  COLONEL: "Colonel",
  TAXMAN: "Taxman",
  COP: "Cop",
};

export const ROLE_LIST = Object.values(ROLES);

export function createDeck() {
  const deck = [];
  for (const role of ROLE_LIST) {
    deck.push(role, role, role);
  }
  return shuffle(deck);
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
