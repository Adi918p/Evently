import { Link } from "react-router-dom";
import DocPage from "../components/layout/DocPage";

/**
 * Privacy policy. The four sections and their wording are carried over from the
 * legacy page unchanged - this is a policy statement, not copy to rewrite.
 */

const SECTIONS = [
  {
    id: "collect",
    heading: "Information we collect",
    body: [
      "We may collect your name, email address, profile information, booking history, and account preferences.",
    ],
  },
  {
    id: "use",
    heading: "How we use your information",
    body: [
      "Your information is used to manage accounts, process bookings, improve services, and provide customer support.",
    ],
  },
  {
    id: "security",
    heading: "Data security",
    body: ["We implement industry-standard security measures to protect user data."],
  },
  {
    id: "third-party",
    heading: "Third-party services",
    body: [
      "Evently may use services such as Google Authentication and payment providers.",
    ],
  },
];

export default function Privacy() {
  return (
    <DocPage
      kicker="Legal"
      title="Privacy Policy"
      intro="What we collect, why we collect it, and who else is involved."
      sections={SECTIONS}
      footer={
        <p className="text-sm text-[var(--color-fg-subtle)]">
          Questions about your data?{" "}
          <Link
            to="/contact"
            className="font-semibold text-[var(--color-violet-bright)] underline decoration-1 underline-offset-4"
          >
            Get in touch
          </Link>{" "}
          and we'll answer.
        </p>
      }
    />
  );
}
