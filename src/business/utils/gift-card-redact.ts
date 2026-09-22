import { BusinessGiftCard } from '../entities/business-giftcard.entity';

// A gift card's code is what redeems it — whoever knows it can spend the balance. The merchant who
// creates and sells a card has no legitimate reason to see it: the code goes to the recipient by
// email, and a merchant who both creates a card AND can see its code could redeem it themselves
// with nothing to connect that to a real paying customer. Strips `code` from anything shown back to
// a merchant; the raw entity (code included) is still used internally wherever a caller already has
// the code and is looking it up BY it (findByCode, redeem) — that's not a new leak, they typed it in.
export function redactGiftCardCode<T extends Partial<BusinessGiftCard>>(card: T): Omit<T, 'code'> {
  const { code, ...rest } = card as any;
  return rest;
}

export function redactGiftCardCodes<T extends Partial<BusinessGiftCard>>(cards: T[]): Omit<T, 'code'>[] {
  return cards.map(redactGiftCardCode);
}
