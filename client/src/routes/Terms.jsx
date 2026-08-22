import { Link } from "react-router-dom";
import DocPage from "../components/layout/DocPage";

/**
 * Terms and conditions. Wording carried over from the legacy page unchanged.
 */

const SECTIONS = [
  {
    id: "use",
    heading: "Use of service",
    body: [
      "By using Evently, you agree to follow all applicable laws and platform rules.",
    ],
  },
  {
    id: "bookings",
    heading: "Event bookings",
    body: ["Tickets are subject to availability and organizer policies."],
  },
  {
    id: "organizers",
    heading: "Organizer responsibilities",
    body: ["Organizers are responsible for the accuracy of event information."],
  },
  {
    id: "suspension",
    heading: "Account suspension",
    body: [
      "Evently reserves the right to suspend accounts involved in abuse or fraudulent activity.",
    ],
  },
];

export default function Terms() {
  return (
    <DocPage
      kicker="Legal"
      title="Terms & Conditions"
      intro="The rules of the road for attendees and organizers alike."
      sections={SECTIONS}
      footer={
        <p className="text-sm text-[var(--color-fg-subtle)]">
          Also worth reading:{" "}
          <Link
            to="/privacy"
            className="font-semibold text-[var(--color-violet-bright)] underline decoration-1 underline-offset-4"
          >
            our Privacy Policy
          </Link>
          .
        </p>
      }
    />
  );
}
