// TEMPORARY, replaced by the real data of the texts branch (assets/books/*.json behind bookText.ts). A few chapters of three books, only to try
// the reader until that branch is merged: the Imitation of Christ (Book One, chapters I to III, and Book Two, chapters I and II, W. Benham
// translation) and the Confessions (the first paragraphs of Books I to III, E. B. Pusey translation), both public domain, and a made-up book
// for the long chapter, the poem and the numbered points. Nothing here is the text of a book as it will be.
import type { BookBlock, BookChapter, BookText } from './bookTextTypes';

const IMITATION: BookChapter[] = [
  {
    "id": "c1",
    "title": "Chapter I. Of the imitation of Christ, and of contempt of the world and all its vanities",
    "part": "Book One",
    "blocks": [
      {
        "k": "p",
        "t": "He that followeth me shall not walk in darkness, saith the Lord. These are the words of Christ; and they teach us how far we must imitate His life and character, if we seek true illumination, and deliverance from all blindness of heart. Let it be our most earnest study, therefore, to dwell upon the life of Jesus Christ."
      },
      {
        "k": "p",
        "t": "2. His teaching surpasseth all teaching of holy men, and such as have His Spirit find therein the hidden manna. But there are many who, though they frequently hear the Gospel, yet feel but little longing after it, because they have not the mind of Christ. He, therefore, that will fully and with true wisdom understand the words of Christ, let him strive to conform his whole life to that mind of Christ."
      },
      {
        "k": "p",
        "t": "3. What doth it profit thee to enter into deep discussion concerning the Holy Trinity, if thou lack humility, and be thus displeasing to the Trinity? For verily it is not deep words that make a man holy and upright; it is a good life which maketh a man dear to God. I had rather feel contrition than be skilful in the definition thereof. If thou knewest the whole Bible, and the sayings of all the philosophers, what should all this profit thee without the love and grace of God? Vanity of vanities, all is vanity, save to love God, and Him only to serve. That is the highest wisdom, to cast the world behind us, and to reach forward to the heavenly kingdom."
      },
      {
        "k": "p",
        "t": "4. It is vanity then to seek after, and to trust in, the riches that shall perish. It is vanity, too, to covet honours, and to lift up ourselves on high. It is vanity to follow the desires of the flesh and be led by them, for this shall bring misery at the last. It is vanity to desire a long life, and to have little care for a good life. It is vanity to take thought only for the life which now is, and not to look forward to the things which shall be hereafter. It is vanity to love that which quickly passeth away, and not to hasten where eternal joy abideth."
      },
      {
        "k": "p",
        "t": "5. Be ofttimes mindful of the saying, The eye is not satisfied with seeing, nor the ear with hearing. Strive, therefore, to turn away thy heart from the love of the things that are seen, and to set it upon the things that are not seen. For they who follow after their own fleshly lusts, defile the conscience, and destroy the grace of God."
      }
    ]
  },
  {
    "id": "c2",
    "title": "Chapter II. Of thinking humbly of oneself",
    "part": "Book One",
    "blocks": [
      {
        "k": "p",
        "t": "There is naturally in every man a desire to know, but what profiteth knowledge without the fear of God? Better of a surety is a lowly peasant who serveth God, than a proud philosopher who watcheth the stars and neglecteth the knowledge of himself. He who knoweth himself well is vile in his own sight; neither regardeth he the praises of men. If I knew all the things that are in the world, and were not in charity, what should it help me before God, who is to judge me according to my deeds?"
      },
      {
        "k": "p",
        "t": "2. Rest from inordinate desire of knowledge, for therein is found much distraction and deceit. Those who have knowledge desire to appear learned, and to be called wise. Many things there are to know which profiteth little or nothing to the soul. And foolish out of measure is he who attendeth upon other things rather than those which serve to his soul’s health. Many words satisfy not the soul, but a good life refresheth the mind, and a pure conscience giveth great confidence towards God."
      },
      {
        "k": "p",
        "t": "3. The greater and more complete thy knowledge, the more severely shalt thou be judged, unless thou hast lived holily. Therefore be not lifted up by any skill or knowledge that thou hast; but rather fear concerning the knowledge which is given to thee. If it seemeth to thee that thou knowest many things, and understandest them well, know also that there are many more things which thou knowest not. Be not high-minded, but rather confess thine ignorance. Why desirest thou to lift thyself above another, when there are found many more learned and more skilled in the Scripture than thou? If thou wilt know and learn anything with profit, love to be thyself unknown and to be counted for nothing."
      },
      {
        "k": "p",
        "t": "4. That is the highest and most profitable lesson, when a man truly knoweth and judgeth lowly of himself. To account nothing of one’s self, and to think always kindly and highly of others, this is great and perfect wisdom. Even shouldest thou see thy neighbor sin openly or grievously, yet thou oughtest not to reckon thyself better than he, for thou knowest not how long thou shalt keep thine integrity. All of us are weak and frail; hold thou no man more frail than thyself."
      }
    ]
  },
  {
    "id": "c3",
    "title": "Chapter III. Of the knowledge of truth",
    "part": "Book One",
    "blocks": [
      {
        "k": "p",
        "t": "Happy is the man whom Truth by itself doth teach, not by figures and transient words, but as it is in itself. Our own judgment and feelings often deceive us, and we discern but little of the truth. What doth it profit to argue about hidden and dark things, concerning which we shall not be even reproved in the judgment, because we knew them not? Oh, grievous folly, to neglect the things which are profitable and necessary, and to give our minds to things which are curious and hurtful! Having eyes, we see not."
      },
      {
        "k": "p",
        "t": "2. And what have we to do with talk about genus and species! He to whom the Eternal Word speaketh is free from multiplied questionings. From this One Word are all things, and all things speak of Him; and this is the Beginning which also speaketh unto us. No man without Him understandeth or rightly judgeth. The man to whom all things are one, who bringeth all things to one, who seeth all things in one, he is able to remain steadfast of spirit, and at rest in God. O God, who art the Truth, make me one with Thee in everlasting love. It wearieth me oftentimes to read and listen to many things; in Thee is all that I wish for and desire. Let all the doctors hold their peace; let all creation keep silence before Thee: speak Thou alone to me."
      },
      {
        "k": "p",
        "t": "3. The more a man hath unity and simplicity in himself, the more things and the deeper things he understandeth; and that without labour, because he receiveth the light of understanding from above. The spirit which is pure, sincere, and steadfast, is not distracted though it hath many works to do, because it doth all things to the honour of God, and striveth to be free from all thoughts of self-seeking. Who is so full of hindrance and annoyance to thee as thine own undisciplined heart? A man who is good and devout arrangeth beforehand within his own heart the works which he hath to do abroad; and so is not drawn away by the desires of his evil will, but subjecteth everything to the judgment of right reason. Who hath a harder battle to fight than he who striveth for self-mastery? And this should be our endeavour, even to master self, and thus daily to grow stronger than self, and go on unto perfection."
      },
      {
        "k": "p",
        "t": "4. All perfection hath some imperfection joined to it in this life, and all our power of sight is not without some darkness. A lowly knowledge of thyself is a surer way to God than the deep searching of man’s learning. Not that learning is to be blamed, nor the taking account of anything that is good; but a good conscience and a holy life is better than all. And because many seek knowledge rather than good living, therefore they go astray, and bear little or no fruit."
      },
      {
        "k": "p",
        "t": "5. O if they would give that diligence to the rooting out of vice and the planting of virtue which they give unto vain questionings: there had not been so many evil doings and stumbling-blocks among the laity, nor such ill living among houses of religion. Of a surety, at the Day of Judgment it will be demanded of us, not what we have read, but what we have done; not how well we have spoken, but how holily we have lived. Tell me, where now are all those masters and teachers, whom thou knewest well, whilst they were yet with you, and flourished in learning? Their stalls are now filled by others, who perhaps never have one thought concerning them. Whilst they lived they seemed to be somewhat, but now no one speaks of them."
      },
      {
        "k": "p",
        "t": "6. Oh how quickly passeth the glory of the world away! Would that their life and knowledge had agreed together! For then would they have read and inquired unto good purpose. How many perish through empty learning in this world, who care little for serving God. And because they love to be great more than to be humble, therefore they “have become vain in their imaginations.” He only is truly great, who hath great charity. He is truly great who deemeth himself small, and counteth all height of honour as nothing. He is the truly wise man, who counteth all earthly things as dung that he may win Christ. And he is the truly learned man, who doeth the will of God, and forsaketh his own will."
      }
    ]
  },
  {
    "id": "c4",
    "title": "Chapter I. Of the inward life",
    "part": "Book Two",
    "blocks": [
      {
        "k": "p",
        "t": "The kingdom of God is within you, saith the Lord. Turn thee with all thine heart to the Lord and forsake this miserable world, and thou shalt find rest unto thy soul. Learn to despise outward things and to give thyself to things inward, and thou shalt see the kingdom of God come within thee. For the kingdom of God is peace and joy in the Holy Ghost, and it is not given to the wicked. Christ will come to thee, and show thee His consolation, if thou prepare a worthy mansion for Him within thee. All His glory and beauty is from within, and there it pleaseth Him to dwell. He often visiteth the inward man and holdeth with him sweet discourse, giving him soothing consolation, much peace, friendship exceeding wonderful."
      },
      {
        "k": "p",
        "t": "2. Go to, faithful soul, prepare thy heart for this bridegroom that he may vouchsafe to come to thee and dwell within thee, for so He saith, if any man loveth me he will keep my words: and my Father will love him, and we will come unto him and make our abode with him. Give, therefore, place to Christ and refuse entrance to all others. When thou hast Christ, thou art rich, and hast sufficient. He shall be thy provider and faithful watchman in all things, so that thou hast no need to trust in men, for men soon change and swiftly pass away, but Christ remaineth for ever and standeth by us firmly even to the end."
      },
      {
        "k": "p",
        "t": "3. There is no great trust to be placed in a frail and mortal man, even though he be useful and dear to us, neither should much sorrow arise within us if sometimes he oppose and contradict us. They who are on thy side to-day, may to-morrow be against thee, and often are they turned round like the wind. Put thy whole trust in God and let Him be thy fear and thy love, He will answer for thee Himself, and will do for thee what is best. Here hast thou no continuing city, and wheresoever thou art, thou art a stranger and a pilgrim, and thou shalt never have rest unless thou art closely united to Christ within thee."
      },
      {
        "k": "p",
        "t": "4. Why dost thou cast thine eyes hither and thither, since this is not the place of thy rest? In heaven ought thy habitation to be, and all earthly things should be looked upon as it were in the passing by. All things pass away and thou equally with them. Look that thou cleave not to them lest thou be taken with them and perish. Let thy contemplation be on the Most High, and let thy supplication be directed unto Christ without ceasing. If thou canst not behold high and heavenly things, rest thou in the passion of Christ and dwell willingly in His sacred wounds. For if thou devoutly fly to the wounds of Jesus, and the precious marks of the nails and the spear, thou shalt find great comfort in tribulation, nor will the slights of men trouble thee much, and thou wilt easily bear their unkind words."
      },
      {
        "k": "p",
        "t": "5. Christ also, when He was in the world, was despised and rejected of men, and in His greatest necessity was left by His acquaintance and friends to bear these reproaches. Christ was willing to suffer and be despised, and darest thou complain of any? Christ had adversaries and gainsayers, and dost thou wish to have all men thy friends and benefactors? Whence shall thy patience attain her crown if no adversity befall thee? If thou art unwilling to suffer any adversity, how shalt thou be the friend of Christ? Sustain thyself with Christ and for Christ if thou wilt reign with Christ."
      },
      {
        "k": "p",
        "t": "6. If thou hadst once entered into the mind of Jesus, and hadst tasted yea even a little of his tender love, then wouldst thou care nought for thine own convenience or inconvenience, but wouldst rather rejoice at trouble brought upon thee, because the love of Jesus maketh a man to despise himself. He who loveth Jesus, and is inwardly true and free from inordinate affections, is able to turn himself readily unto God, and to rise above himself in spirit, and to enjoy fruitful peace."
      },
      {
        "k": "p",
        "t": "7. He who knoweth things as they are and not as they are said or seem to be, he truly is wise, and is taught of God more than of men. He who knoweth how to walk from within, and to set little value upon outward things, requireth not places nor waiteth for seasons, for holding his intercourse with God. The inward man quickly recollecteth himself, because he is never entirely given up to outward things. No outward labour and no necessary occupations stand in his way, but as events fall out, so doth he fit himself to them. He who is rightly disposed and ordered within careth not for the strange and perverse conduct of men. A man is hindered and distracted in so far as he is moved by outward things."
      },
      {
        "k": "p",
        "t": "8. If it were well with thee, and thou wert purified from evil, all things would work together for thy good and profiting. For this cause do many things displease thee and often trouble thee, that thou art not yet perfectly dead to thyself nor separated from all earthly things. Nothing so defileth and entangleth the heart of man as impure love towards created things. If thou rejectest outward comfort thou wilt be able to contemplate heavenly things and frequently to be joyful inwardly."
      }
    ]
  },
  {
    "id": "c5",
    "title": "Chapter II. Of lowly submission",
    "part": "Book Two",
    "blocks": [
      {
        "k": "p",
        "t": "Make no great account who is for thee or against thee, but mind only the present duty and take care that God be with thee in whatsoever thou doest. Have a good conscience and God will defend thee, for he whom God will help no man’s perverseness shall be able to hurt. If thou knowest how to hold thy peace and to suffer, without doubt thou shalt see the help of the Lord. He knoweth the time and the way to deliver thee, therefore must thou resign thyself to Him. To God it belongeth to help and to deliver from all confusion. Oftentimes it is very profitable for keeping us in greater humility, that others know and rebuke our faults."
      },
      {
        "k": "p",
        "t": "2. When a man humbleth himself for his defects, he then easily pacifieth others and quickly satisfieth those that are angered against him. God protecteth and delivereth the humble man, He loveth and comforteth the humble man, to the humble man He inclineth Himself, on the humble He bestoweth great grace, and when he is cast down He raiseth him to glory: to the humble He revealeth His secrets, and sweetly draweth and inviteth him to Himself. The humble man having received reproach, is yet in sufficient peace, because he resteth on God and not on the world. Reckon not thyself to have profited in anywise unless thou feel thyself to be inferior to all."
      }
    ]
  }
];

const CONFESSIONS: BookChapter[] = [
  {
    "id": "c1",
    "title": "Book I",
    "blocks": [
      {
        "k": "p",
        "t": "Great art Thou, O Lord, and greatly to be praised; great is Thy power, and Thy wisdom infinite. And Thee would man praise; man, but a particle of Thy creation; man, that bears about him his mortality, the witness of his sin, the witness that Thou resistest the proud: yet would man praise Thee; he, but a particle of Thy creation. Thou awakest us to delight in Thy praise; for Thou madest us for Thyself, and our heart is restless, until it repose in Thee. Grant me, Lord, to know and understand which is first, to call on Thee or to praise Thee? and, again, to know Thee or to call on Thee? for who can call on Thee, not knowing Thee? for he that knoweth Thee not, may call on Thee as other than Thou art. Or, is it rather, that we call on Thee that we may know Thee? but how shall they call on Him in whom they have not believed? or how shall they believe without a preacher? and they that seek the Lord shall praise Him: for they that seek shall find Him, and they that find shall praise Him. I will seek Thee, Lord, by calling on Thee; and will call on Thee, believing in Thee; for to us hast Thou been preached. My faith, Lord, shall call on Thee, which Thou hast given me, wherewith Thou hast inspired me, through the Incarnation of Thy Son, through the ministry of the Preacher."
      },
      {
        "k": "p",
        "t": "And how shall I call upon my God, my God and Lord, since, when I call for Him, I shall be calling Him to myself? and what room is there within me, whither my God can come into me? whither can God come into me, God who made heaven and earth? is there, indeed, O Lord my God, aught in me that can contain Thee? do then heaven and earth, which Thou hast made, and wherein Thou hast made me, contain Thee? or, because nothing which exists could exist without Thee, doth therefore whatever exists contain Thee? Since, then, I too exist, why do I seek that Thou shouldest enter into me, who were not, wert Thou not in me? Why? because I am not gone down in hell, and yet Thou art there also. For if I go down into hell, Thou art there. I could not be then, O my God, could not be at all, wert Thou not in me; or, rather, unless I were in Thee, of whom are all things, by whom are all things, in whom are all things? Even so, Lord, even so. Whither do I call Thee, since I am in Thee? or whence canst Thou enter into me? for whither can I go beyond heaven and earth, that thence my God should come into me, who hath said, I fill the heaven and the earth."
      },
      {
        "k": "p",
        "t": "Do the heaven and earth then contain Thee, since Thou fillest them? or dost Thou fill them and yet overflow, since they do not contain Thee? And whither, when the heaven and the earth are filled, pourest Thou forth the remainder of Thyself? or hast Thou no need that aught contain Thee, who containest all things, since what Thou fillest Thou fillest by containing it? for the vessels which Thou fillest uphold Thee not, since, though they were broken, Thou wert not poured out. And when Thou art poured out on us, Thou art not cast down, but Thou upliftest us; Thou art not dissipated, but Thou gatherest us. But Thou who fillest all things, fillest Thou them with Thy whole self? or, since all things cannot contain Thee wholly, do they contain part of Thee? and all at once the same part? or each its own part, the greater more, the smaller less? And is, then one part of Thee greater, another less? or, art Thou wholly every where, while nothing contains Thee wholly?"
      },
      {
        "k": "p",
        "t": "What art Thou then, my God? what, but the Lord God? For who is Lord but the Lord? or who is God save our God? Most highest, most good, most potent, most omnipotent; most merciful, yet most just; most hidden, yet most present; most beautiful, yet most strong, stable, yet incomprehensible; unchangeable, yet all-changing; never new, never old; all-renewing, and bringing age upon the proud, and they know it not; ever working, ever at rest; still gathering, yet nothing lacking; supporting, filling, and overspreading; creating, nourishing, and maturing; seeking, yet having all things. Thou lovest, without passion; art jealous, without anxiety; repentest, yet grievest not; art angry, yet serene; changest Thy works, Thy purpose unchanged; receivest again what Thou findest, yet didst never lose; never in need, yet rejoicing in gains; never covetous, yet exacting usury. Thou receivest over and above, that Thou mayest owe; and who hath aught that is not Thine? Thou payest debts, owing nothing; remittest debts, losing nothing. And what had I now said, my God, my life, my holy joy? or what saith any man when he speaks of Thee? Yet woe to him that speaketh not, since mute are even the most eloquent."
      }
    ]
  },
  {
    "id": "c2",
    "title": "Book II",
    "blocks": [
      {
        "k": "p",
        "t": "I will now call to mind my past foulness, and the carnal corruptions of my soul; not because I love them, but that I may love Thee, O my God. For love of Thy love I do it; reviewing my most wicked ways in the very bitterness of my remembrance, that Thou mayest grow sweet unto me (Thou sweetness never failing, Thou blissful and assured sweetness); and gathering me again out of that my dissipation, wherein I was torn piecemeal, while turned from Thee, the One Good, I lost myself among a multiplicity of things. For I even burnt in my youth heretofore, to be satiated in things below; and I dared to grow wild again, with these various and shadowy loves: my beauty consumed away, and I stank in Thine eyes; pleasing myself, and desirous to please in the eyes of men."
      },
      {
        "k": "p",
        "t": "And what was it that I delighted in, but to love, and be loved? but I kept not the measure of love, of mind to mind, friendship's bright boundary: but out of the muddy concupiscence of the flesh, and the bubblings of youth, mists fumed up which beclouded and overcast my heart, that I could not discern the clear brightness of love from the fog of lustfulness. Both did confusedly boil in me, and hurried my unstayed youth over the precipice of unholy desires, and sunk me in a gulf of flagitiousnesses. Thy wrath had gathered over me, and I knew it not. I was grown deaf by the clanking of the chain of my mortality, the punishment of the pride of my soul, and I strayed further from Thee, and Thou lettest me alone, and I was tossed about, and wasted, and dissipated, and I boiled over in my fornications, and Thou heldest Thy peace, O Thou my tardy joy! Thou then heldest Thy peace, and I wandered further and further from Thee, into more and more fruitless seed-plots of sorrows, with a proud dejectedness, and a restless weariness."
      },
      {
        "k": "p",
        "t": "Oh! that some one had then attempered my disorder, and turned to account the fleeting beauties of these, the extreme points of Thy creation! had put a bound to their pleasureableness, that so the tides of my youth might have cast themselves upon the marriage shore, if they could not be calmed, and kept within the object of a family, as Thy law prescribes, O Lord: who this way formest the offspring of this our death, being able with a gentle hand to blunt the thorns which were excluded from Thy paradise? For Thy omnipotency is not far from us, even when we be far from Thee. Else ought I more watchfully to have heeded the voice from the clouds: Nevertheless such shall have trouble in the flesh, but I spare you. And it is good for a man not to touch a woman. And, he that is unmarried thinketh of the things of the Lord, how he may please the Lord; but he that is married careth for the things of this world, how he may please his wife."
      },
      {
        "k": "p",
        "t": "To these words I should have listened more attentively, and being severed for the kingdom of heaven's sake, had more happily awaited Thy embraces; but I, poor wretch, foamed like a troubled sea, following the rushing of my own tide, forsaking Thee, and exceeded all Thy limits; yet I escaped not Thy scourges. For what mortal can? For Thou wert ever with me mercifully rigorous, and besprinkling with most bitter alloy all my unlawful pleasures: that I might seek pleasures without alloy. But where to find such, I could not discover, save in Thee, O Lord, who teachest by sorrow, and woundest us, to heal; and killest us, lest we die from Thee. Where was I, and how far was I exiled from the delights of Thy house, in that sixteenth year of the age of my flesh, when the madness of lust (to which human shamelessness giveth free licence, though unlicensed by Thy laws) took the rule over me, and I resigned myself wholly to it? My friends meanwhile took no care by marriage to save my fall; their only care was that I should learn to speak excellently, and be a persuasive orator."
      }
    ]
  },
  {
    "id": "c3",
    "title": "Book III",
    "blocks": [
      {
        "k": "p",
        "t": "To Carthage I came, where there sang all around me in my ears a cauldron of unholy loves. I loved not yet, yet I loved to love, and out of a deep-seated want, I hated myself for wanting not. I sought what I might love, in love with loving, and safety I hated, and a way without snares. For within me was a famine of that inward food, Thyself, my God; yet, through that famine I was not hungered; but was without all longing for incorruptible sustenance, not because filled therewith, but the more empty, the more I loathed it. For this cause my soul was sickly and full of sores, it miserably cast itself forth, desiring to be scraped by the touch of objects of sense. Yet if these had not a soul, they would not be objects of love. To love then, and to be beloved, was sweet to me; but more, when I obtained to enjoy the person I loved, I defiled, therefore, the spring of friendship with the filth of concupiscence, and I beclouded its brightness with the hell of lustfulness; and thus foul and unseemly, I would fain, through exceeding vanity, be fine and courtly. I fell headlong then into the love wherein I longed to be ensnared. My God, my Mercy, with how much gall didst Thou out of Thy great goodness besprinkle for me that sweetness? For I was both beloved, and secretly arrived at the bond of enjoying; and was with joy fettered with sorrow-bringing bonds, that I might be scourged with the iron burning rods of jealousy, and suspicions, and fears, and angers, and quarrels."
      },
      {
        "k": "p",
        "t": "Stage-plays also carried me away, full of images of my miseries, and of fuel to my fire. Why is it, that man desires to be made sad, beholding doleful and tragical things, which yet himself would no means suffer? yet he desires as a spectator to feel sorrow at them, and this very sorrow is his pleasure. What is this but a miserable madness? for a man is the more affected with these actions, the less free he is from such affections. Howsoever, when he suffers in his own person, it uses to be styled misery: when he compassionates others, then it is mercy. But what sort of compassion is this for feigned and scenical passions? for the auditor is not called on to relieve, but only to grieve: and he applauds the actor of these fictions the more, the more he grieves. And if the calamities of those persons (whether of old times, or mere fiction) be so acted, that the spectator is not moved to tears, he goes away disgusted and criticising; but if he be moved to passion, he stays intent, and weeps for joy."
      },
      {
        "k": "p",
        "t": "Are griefs then too loved? Verily all desire joy. Or whereas no man likes to be miserable, is he yet pleased to be merciful? which because it cannot be without passion, for this reason alone are passions loved? This also springs from that vein of friendship. But whither goes that vein? whither flows it? wherefore runs it into that torrent of pitch bubbling forth those monstrous tides of foul lustfulness, into which it is wilfully changed and transformed, being of its own will precipitated and corrupted from its heavenly clearness? Shall compassion then be put away? by no means. Be griefs then sometimes loved. But beware of uncleanness, O my soul, under the guardianship of my God, the God of our fathers, who is to be praised and exalted above all for ever, beware of uncleanness. For I have not now ceased to pity; but then in the theatres I rejoiced with lovers when they wickedly enjoyed one another, although this was imaginary only in the play. And when they lost one another, as if very compassionate, I sorrowed with them, yet had my delight in both. But now I much more pity him that rejoiceth in his wickedness, than him who is thought to suffer hardship, by missing some pernicious pleasure, and the loss of some miserable felicity. This certainly is the truer mercy, but in it grief delights not. For though he that grieves for the miserable, be commended for his office of charity; yet had he, who is genuinely compassionate, rather there were nothing for him to grieve for. For if good will be ill willed (which can never be), then may he, who truly and sincerely commiserates, wish there might be some miserable, that he might commiserate. Some sorrow may then be allowed, none loved. For thus dost Thou, O Lord God, who lovest souls far more purely than we, and hast more incorruptibly pity on them, yet are wounded with no sorrowfulness. And who is sufficient for these things?"
      },
      {
        "k": "p",
        "t": "But I, miserable, then loved to grieve, and sought out what to grieve at, when in another's and that feigned and personated misery, that acting best pleased me, and attracted me the most vehemently, which drew tears from me. What marvel that an unhappy sheep, straying from Thy flock, and impatient of Thy keeping, I became infected with a foul disease? And hence the love of griefs; not such as should sink deep into me; for I loved not to suffer, what I loved to look on; but such as upon hearing their fictions should lightly scratch the surface; upon which, as on envenomed nails, followed inflamed swelling, impostumes, and a putrefied sore. My life being such, was it life, O my God?"
      }
    ]
  }
];

const p = (t: string): BookBlock => ({ k: 'p', t });

/** The made-up book: passages of the Imitation over and over, so that one chapter is as long as the longest chapter of a real book (about 15,000 words). */
function longBlocks(from: BookChapter[], count: number): BookBlock[] {
  const source = from.flatMap((c) => c.blocks).filter((b): b is Extract<BookBlock, { k: 'p' }> => b.k === 'p');
  return Array.from({ length: count }, (_, i) => p(source[(i * 7 + 3) % source.length].t));
}

const SHORT: BookChapter[] = [
  {
    id: 'c1', title: 'Chapter 1', part: 'Part One',
    blocks: [
      p(IMITATION[0].blocks[0].k === 'p' ? (IMITATION[0].blocks[0] as { t: string }).t : ''),
      { k: 'h', t: 'A prayer, in the words of a psalm' },
      { k: 'q', t: 'The Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures: he leadeth me beside the still waters.\nHe restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.' },
      { k: 'h', t: 'Five points to remember' },
      { k: 'li', t: '1. Thou shalt have no other gods before me.' },
      { k: 'li', t: '2. Thou shalt not make unto thee any graven image.' },
      { k: 'li', t: '3. Thou shalt not take the name of the Lord thy God in vain.' },
      { k: 'li', t: '4. Remember the sabbath day, to keep it holy.' },
      { k: 'li', t: '5. Honour thy father and thy mother.' },
      { k: 'hr' },
      p((IMITATION[1].blocks[0] as { t: string }).t),
    ],
  },
  { id: 'c2', title: 'Chapter 2. A long chapter', part: 'Part One', blocks: longBlocks(IMITATION, 150) },
  { id: 'c3', title: 'Chapter 3', part: 'Part Two', blocks: IMITATION[2].blocks.slice(0, 3) },
];

const FIXTURES: Record<string, BookText> = {
  'imitation-of-christ': {
    id: 'imitation-of-christ', title: 'The Imitation of Christ', author: 'Thomas à Kempis', translator: 'William Benham',
    credit: 'The Imitation of Christ, translated by William Benham (1905 edition). Public domain. TEMPORARY test fixture: a few chapters only.',
    chapters: IMITATION,
  },
  confessions: {
    id: 'confessions', title: 'Confessions', author: 'Augustine of Hippo', translator: 'E. B. Pusey',
    credit: 'The Confessions of St. Augustine, translated by E. B. Pusey (1838). Public domain. TEMPORARY test fixture: a few paragraphs only.',
    chapters: CONFESSIONS,
  },
  'dialogue-of-st-catherine': {
    id: 'dialogue-of-st-catherine', title: 'The Dialogue of Saint Catherine of Siena', author: 'Catherine of Siena',
    credit: 'TEMPORARY test fixture: not the text of this book. Passages of the Imitation of Christ, a psalm and the commandments, made to try the reader.',
    chapters: SHORT,
  },
};

export const FIXTURE_IDS: readonly string[] = Object.keys(FIXTURES);
export const fixtureText = (id: string): BookText | undefined => FIXTURES[id];
