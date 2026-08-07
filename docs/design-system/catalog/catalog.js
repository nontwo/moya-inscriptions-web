const root = document.documentElement;
const themeControl = document.querySelector("[data-preview-theme]");
const motionControl = document.querySelector("[data-preview-motion]");

themeControl?.addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = value;
});

motionControl?.addEventListener("change", (event) => {
  if (event.target.checked) root.dataset.motion = "reduced";
  else root.removeAttribute("data-motion");
});

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.openDialog)?.showModal();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});

document.querySelector("[data-show-loading]")?.addEventListener("click", () => {
  const loading = document.querySelector(".preview-full-loading");
  loading.hidden = false;
  window.setTimeout(() => {
    loading.hidden = true;
  }, 1200);
});
