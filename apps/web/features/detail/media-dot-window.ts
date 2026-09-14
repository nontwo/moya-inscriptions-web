/** At most five indicators, with smaller edge dots when more images continue. */
export const mediaDotWindow = (total: number, active: number) => {
  const length = Math.min(5, total);
  const start = Math.max(0, Math.min(active - 2, total - length));
  return Array.from({ length }, (_, offset) => {
    const index = start + offset;
    return {
      index,
      edge:
        index !== active &&
        ((offset === 0 && start > 0) ||
          (offset === length - 1 && index < total - 1)),
    };
  });
};
