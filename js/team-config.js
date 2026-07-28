/* ============================================================
   Apex IT Consultant — team-config.js

   Add a person here + drop their photos in profile_pic/ and the
   team page renders the same 3D particle portrait for them:

     1. Save one or more portrait photos to profile_pic/.
        Any framing works — the page removes the background
        automatically (person segmentation in the browser).
        Sharp, well-lit, roughly head-and-shoulders shots of a
        single person give the best result.
     2. Add an entry below (key = URL slug).
     3. Open team.html?p=<key>   (no key = DEFAULT_PERSON)

   Each entry in `views` becomes a button; the portrait morphs
   between views as stardust.
   ============================================================ */

export const DEFAULT_PERSON = 'shervin';

export const PEOPLE = {
  shervin: {
    name: 'Shervin Soleymanpoor',
    role: 'CEO · Developer & Architect',
    focus: 'SAP BTP · UI5 · CAP',
    bio: 'Founder of Apex IT Consultant. Hands-on architect building cloud-native SAP solutions on the Business Technology Platform.',
    views: [
      { label: 'Front', src: 'profile_pic/shervin_front.jpeg' },
      { label: 'Profile', src: 'profile_pic/shervin_side.jpeg' },
    ],
  },

  jimmy: {
    name: 'Jimmy D.',
    role: 'CEO · Marketing & Relations',
    focus: 'Marketing · Relation Management',
    bio: 'Co-founder of Apex IT Consultant. Marketing expert and relationship builder — the bridge between our engineers and the enterprises they work with.',
    views: [
      { label: 'Portrait', src: 'profile_pic/jimmy_front.jpeg' },
    ],
  },

  // Next person: add photos + one entry, done. For example:
  // jane: {
  //   name: 'Jane Doe',
  //   role: 'SAP Integration Consultant',
  //   focus: 'Integration Suite · Event Mesh',
  //   bio: 'Connects SAP and non-SAP worlds.',
  //   views: [{ label: 'Portrait', src: 'profile_pic/jane.jpg' }],
  // },
};
