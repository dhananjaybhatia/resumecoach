import CompanionCard from "@/components/CompanionCard";
import CompanionList from "@/components/CompanionList";
import CTA from "@/components/CTA";
import { recentSessions } from "@/constants";

const page = () => {
  return (
    <main>
      <h1 className="text-2xlp">Popular Companions</h1>
      <section className="home-section">
        <CompanionCard
          id="123"
          name="Neura the Brainy Explorer"
          topic="Neural Network of the Brain"
          duration={45}
          subject="Science"
          color="#ffda6e"
        />
        <CompanionCard
          id="456"
          name="Countsy the Number Wizard"
          topic="Derivatives & Integrals"
          duration={35}
          subject="Maths"
          color="#e5d0ff"
        />
        <CompanionCard
          id="789"
          name="Verbal Vocabulary Builder"
          topic="English Literature"
          duration={30}
          subject="Language"
          color="#BDE7FF"
        />
      </section>
      <section className="home-section">
        <CompanionList
          title="Recently completed sessions"
          companions={recentSessions}
          classNames="w-2/3 max-lg:w-full"
        />
        <CTA />
      </section>
    </main>
  );
};

export default page;
