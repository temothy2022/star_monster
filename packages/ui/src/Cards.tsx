import planetSaturn from "./assets/planet-saturn.jpeg";
import taskBook from "./assets/task-book.jpeg";
import wishStar from "./assets/wish-star.svg";
import { ProgressBar } from "./ProgressBar";

export interface TaskCardProps {
  title?: string;
  category?: string;
  reward?: number;
  imageSrc?: string;
}

export function TaskCard({
  title = "阅读绘本 20分钟",
  category = "日常任务",
  reward = 5,
  imageSrc = taskBook
}: TaskCardProps) {
  return (
    <article className="sm-card sm-task-card" data-figma-node="1:1512">
      <div className="sm-task-card__content">
        <div className="sm-task-card__image-shell">
          <img src={imageSrc} alt="" />
        </div>
        <div className="sm-task-card__copy">
          <h3>{title}</h3>
          <p>{category}</p>
        </div>
      </div>
      <div className="sm-task-card__reward">
        +{reward} 星星
      </div>
    </article>
  );
}

export interface WishCardProps {
  title?: string;
  current?: number;
  target?: number;
}

export function WishCard({ title = "新自行车", current = 120, target = 200 }: WishCardProps) {
  return (
    <article className="sm-card sm-wish-card" data-figma-node="1:1523">
      <header>
        <h3>{title}</h3>
        <img src={wishStar} alt="" />
      </header>
      <ProgressBar value={current} max={target} label={`${title}进度`} />
      <strong className="sm-wish-card__amount">{current} / {target}</strong>
    </article>
  );
}

export interface PlanetCardProps {
  name?: string;
  imageSrc?: string;
}

export function PlanetCard({ name = "土星基地", imageSrc = planetSaturn }: PlanetCardProps) {
  return (
    <article className="sm-card sm-planet-card" data-figma-node="1:1531">
      <img className="sm-planet-card__image" src={imageSrc} alt="" />
      <h3>{name}</h3>
    </article>
  );
}
