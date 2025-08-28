import CompanionCard from "@/components/CompanionCard";
import CompanionList from "@/components/CompanionList";
import CTA from "@/components/CTA";
import {
  getAllCpmpanions,
  getRecentSessions,
} from "@/lib/actions/companion.actions";
import { getSubjectColor } from "@/lib/utils";

const page = async () => {
  const companions = await getAllCpmpanions({ limit: 3 });
  const recentSessionsCompanions = await getRecentSessions(10);
  return (
    <main>
      <h1 className="text-2xlp">Popular Companions</h1>
      <section className="home-section">
        {companions.map((companion) => (
          <CompanionCard
            key={companion.id}
            color={getSubjectColor(companion.subject)}
            {...companion}
          />
        ))}
      </section>
      <section className="home-section">
        <CompanionList
          title="Recently completed sessions"
          companions={recentSessionsCompanions}
          classNames="w-2/3 max-lg:w-full"
        />
        <CTA />
      </section>
    </main>
  );
};

export default page;
