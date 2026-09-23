import { Injectable, type MessageEvent } from '@nestjs/common';
import { Subject, interval, merge, timer } from 'rxjs';
import { filter, map, startWith, takeUntil } from 'rxjs/operators';

/** Notifications carry no chat or donor data; authenticated clients read durable pages. */
@Injectable()
export class OperatorFeedRealtimeService {
  private readonly updates = new Subject<{channelId:string;kind:'chat'|'donation'}>();

  publish(channelId:string,kind:'chat'|'donation') {
    this.updates.next({channelId,kind});
  }

  stream(channelId:string) {
    return merge(
      this.updates.pipe(filter(event=>event.channelId===channelId),map(event=>({type:'feed.updated',data:event.kind} satisfies MessageEvent))),
      interval(15_000).pipe(map(()=>({type:'heartbeat',data:'ok'} satisfies MessageEvent))),
    ).pipe(startWith({type:'heartbeat',data:'ready'} satisfies MessageEvent),takeUntil(timer(60_000)));
  }
}
