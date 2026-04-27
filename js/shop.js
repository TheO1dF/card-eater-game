import { createShopCardPool, getCardById } from "./data.js";

function shuffle(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function createShopService() {
  function getShopCards(state) {
    const pool = shuffle(createShopCardPool());
    // 优惠券效果在这里生效
    const discount = state.shopDiscount || 0;
    return pool.slice(0, 3).map((card, index) => {
      const basePrice = Math.max(1, Math.ceil((card.eat_points + card.discard_points + state.deck.length + index) / 2));
      return {
        ...card,
        shopPrice: Math.max(1, basePrice - discount), 
      };
    });
  }

  function buyCard(state, card) {
    if (state.gold < card.shopPrice) return false;
    state.gold -= card.shopPrice;
    // 生成新的UUID加入永久卡组，绝对不会覆盖原有卡组
    state.deck.push({ ...(getCardById(card.id) || card), uuid: Math.random().toString(36).substr(2, 9) });
    return true;
  }

  function removeCard(state, cardUuid) {
    const cost = state.remove_card_cost;
    if (state.gold < cost) return false;
    // 根据唯一 UUID 精准删牌
    const index = state.deck.findIndex((c) => c.uuid === cardUuid);
    if (index < 0) return false;
    
    state.gold -= cost;
    state.deck.splice(index, 1); // 仅仅移除这1张牌
    
    state.remove_count += 1;
    state.remove_card_cost = state.remove_count === 0 ? 0 : (state.remove_count === 1 ? 5 : 10);
    return true;
  }

  return { getShopCards, buyCard, removeCard };
}