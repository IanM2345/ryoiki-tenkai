'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './BirthdayCard.module.css';

interface BirthdayCardProps {
  onDismiss: () => void;
}

export default function BirthdayCard({ onDismiss }: BirthdayCardProps) {
  const audioRef             = useRef<HTMLAudioElement | null>(null);
  const [exiting, setExiting] = useState(false);
  const [typed,   setTyped]   = useState('');

  const MESSAGE =
`Ryoiki Tenkai.... Malevolent Shrine
Warning do not close. View Once only.
This is being typed out at 1pm sorry for any spelling mistakes.I made a mistake, a stake?!!Hehe😂😂.
You were complaining and asking for a place where people just gave ratings for everyhting and anything even though that could be reddit but anyway thats kind of what made me decide how about we buld your own personal review plcae and it kind of expanded from that.
 Happy Birthday Laureen. You Might be asking what the actual fuck is playing in my ears but the name and design template for this little gift from me to you was inspire by lobotomy kaisen. The sound is the ost to the sukuna vs mahoraga fight whihc was animated within 2 days in under poor working conditions and won like best animation of the year. Well just like how i built this in less than a month basically suffering and hoping this lands well. I struggled with figuring out what to get you this year after you said you wouldn't like lego while here and would ratjer get it for back at home. Do you know how incosiderate that was, considering i had planned for your gift since last summer??😂😂 I scrambled for so long figuring things outt(almost decided to get you jewelry.Imagine me who sees that stuff like the same things) and I genuinely didn't know if you had something like this so that is why your also getting pork ribs cause i worry i might have given you something you already have and anyway if you do my version is better 😂. I was dying of laughter on Friday internally cause what i am about to say next was funny. If you ever wanted evidence for me actually being good at what i do this serves as evidence, and if you want to use this get me extra clients you can get a 25% cut😂😂 and if you think this isnt good, i built this in 3 weeks allow me. 

 The website is not as refined (some of the game rules maybe off) as i would like it to be and some features had to get delayed cause iran out of time blacking out on Shiko's couch😂😂. Remember the whole locking access to the website thing i wanted to do was actually for you cause itsyour private world and even i dont want access to it unless its you who guves me and i cant understand or see a reaso you wpuld d that. The database is also encryped data and will give you the logins to it if you want still need access for future dev. Yes future dev so this gift comes with an additional 3 rolled out updates...i will have my own ideas and you will be giving requirements and to even add value to this we will do it in the proper dev cycle way. You want to do tech law , well how about we use jira and git hub with your account and add a mini project as part of your cv with commits and clear documentation i am sure that will be helpful. I will also be mantaining it for as long as you need it. Free of charge (you know how much i charge for maintaianance).We can expand on this idea in person.

 I hope you had a great birthday and i hope you love the things i got you. I know you probably know this but i don't want to be a hypocrite and opperate with assumption or the guy who regrets never saying it. I love and cherish you alot i hope that even when i don't show it or say it you not only know it but feel it as well. For as long as you will have me and you don't kill my family or something, i hope to continue enjoying the privilige of wathcing you write your story. I wanted to say more mushy stuff but that's cringe plus remeber language is a horrible vessel for communication😂😂. Enjoy this weird place that i hope you get to make yours.
`;

  // Typewriter effect
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTyped(MESSAGE.slice(0, i));
      if (i >= MESSAGE.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play audio on mount, loop until closed
  useEffect(() => {
    const audio = new Audio('/birthday.mp3');
    audio.loop = true;
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  function handleDismiss() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setExiting(true);
    setTimeout(onDismiss, 400);
  }

  return (
    <div className={styles.backdrop} onClick={handleDismiss}>
      <div
        className={`${styles.card} ${exiting ? styles.exit : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.close} onClick={handleDismiss} aria-label="Close">×</button>

        <div className={styles.seal}>🎂</div>

        <div className={styles.message}>
          {typed}
          <span className={styles.cursor}>|</span>
        </div>

        <div className={styles.waveform} aria-hidden="true">
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </div>

        <p className={styles.hint}>click anywhere outside to close</p>
      </div>
    </div>
  );
}