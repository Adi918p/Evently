/**
 * Razorpay Checkout loader.
 *
 * The script is fetched on demand rather than in index.html: it is ~100kb of
 * third-party JavaScript that only matters on the one page where someone books
 * (third-party-scripts, bundle-splitting).
 *
 * The promise is cached, so opening checkout twice does not load it twice.
 */

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loader = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SRC}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Payment checkout failed to initialise."));
    };
    const onError = () => {
      // Let a later attempt retry from scratch.
      loader = null;
      script.remove();
      reject(
        new Error(
          "Couldn't reach the payment provider. Check your connection and try again."
        )
      );
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return loader;
}

/** Brand colour handed to Razorpay's own UI so checkout does not feel bolted on. */
export const RAZORPAY_THEME = { color: "#6d28d9" };
