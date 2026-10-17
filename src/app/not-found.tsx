import Link from 'next/link';
import { Brand, Icon } from '@/components/app';
export default function NotFound() { return <><header className="public-header"><Brand/></header><main className="main public-main"><section className="panel empty-state"><span className="icon-tile blue"><Icon name="search" size={30}/></span><p className="eyebrow">A SMALL DETOUR</p><h1>That page isn’t here.</h1><p>The link may have changed. There’s still plenty of room for your next thought.</p><Link className="button primary" href="/">Back to the beginning<Icon name="arrow"/></Link></section></main></>; }
