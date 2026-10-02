import { Fragment } from "react";
import { arr, cat, css, txt } from "../../runtime/template";
import HomeBoard from "../../ph/shell/HomeBoard";

type Props = { v: any };

export default function HomeWidgetRail({ v }: Props) {
  return (
    <>
      <aside style={{"position":"relative","zIndex":"1","width":"352px","flex":"none","minHeight":"0","overflowY":"auto","display":"flex","flexDirection":"column","gap":"14px","padding":"2px 0 6px 20px"}}>
        <div style={{"flex":"0 0 auto","minWidth":"0","overflow":"hidden","display":"flex","flexWrap":"nowrap","alignItems":"center","justifyContent":"space-between","gap":"4px","padding":"2px 0 4px","fontFamily":"var(--mono)"}}>
          {arr(v.flipUnits).map((u: any, i15: number) => (
            <Fragment key={i15}>
              <div style={{"display":"flex","flexWrap":"nowrap","alignItems":"center","gap":"3px"}}>
                {arr(u?.tiles).map((t: any, i16: number) => (
                  <Fragment key={i16}>
                    {t?.isColon && (
                      <>
                        <div style={{"display":"flex","flexDirection":"column","gap":"3px","padding":"0 1px"}}>
                          <span style={{"width":"2.5px","height":"2.5px","borderRadius":"2px","background":"var(--accent)","animation":"tickPulse 1s ease-in-out infinite"}} />
                          <span style={{"width":"2.5px","height":"2.5px","borderRadius":"2px","background":"var(--accent)","animation":"tickPulse 1s ease-in-out .1s infinite"}} />
                        </div>
                      </>
                    )}
                    {t?.isTile && (
                      <>
                        <span style={css(cat("position:relative;display:flex;align-items:center;justify-content:center;min-width:", t?.w, ";height:", t?.h, ";padding:0 3px;border-radius:var(--r-sm,9px);background:var(--flap);border:1px solid var(--border);box-shadow:0 3px 8px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.13);font-size:", t?.size, ";font-weight:500;letter-spacing:-0.3px;color:", t?.color, ";overflow:hidden;perspective:100px"))}>
                          <span style={{"position":"absolute","left":"0","right":"0","top":"50%","height":"1px","background":"var(--flap-hinge)","zIndex":"4"}} />
                          {"\n"}
                          {txt(t?.v)}
                          {"\n"}
                          <span style={css(cat("position:absolute;top:0;left:0;right:0;height:50%;overflow:hidden;background:var(--flap);transform-origin:bottom center;backface-visibility:hidden;z-index:3;display:", t?.flapShow, ";animation:", t?.topAnim))}>
                            <span style={{"position":"absolute","top":"0","left":"0","right":"0","height":"200%","display":"flex","alignItems":"center","justifyContent":"center"}}>
                              {txt(t?.prev)}
                            </span>
                          </span>
                          <span style={css(cat("position:absolute;bottom:0;left:0;right:0;height:50%;overflow:hidden;background:var(--flap);transform-origin:top center;backface-visibility:hidden;z-index:3;display:", t?.flapShow, ";animation:", t?.botAnim))}>
                            <span style={{"position":"absolute","bottom":"0","left":"0","right":"0","height":"200%","display":"flex","alignItems":"center","justifyContent":"center"}}>
                              {txt(t?.v)}
                            </span>
                          </span>
                        </span>
                      </>
                    )}
                  </Fragment>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{"display":"flex","alignItems":"center","gap":"8px","padding":"0 4px"}}>
          <span style={{"flex":"1","fontFamily":"var(--mono)","fontSize":"9.5px","letterSpacing":"0.12em","color":"var(--faint)"}}>
            {txt(v.widgetHint)}
          </span>
          <button className="ixm" onClick={v.toggleBgMenu} title="Change background" style={css(v.bgButtonStyle)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" style={css(v.bgPlusStyle)}>
              <path d="M12 5v14 M5 12h14" />
            </svg>
          </button>
          <button onClick={v.toggleWidgetEdit} style={css(cat("height:26px;display:flex;align-items:center;gap:6px;padding:0 11px;background:", v.widgetEditBg, ";border:1px solid ", v.widgetEditBorder, ";border-radius:var(--r-ctl,9px);font-size:11.5px;color:", v.widgetEditColor, ";cursor:pointer;transition:background .2s var(--ease),border-color .2s var(--ease)"))}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6V20Z" />
            </svg>
            {txt(v.widgetEditLabel)}
          </button>
        </div>
        {v.widgetEdit && (
          <>
            <div style={{"padding":"14px 16px","background":"var(--surface)","border":"1px dashed var(--border-strong)","borderRadius":"var(--card-r,18px)","animation":"expandIn .28s var(--ease) both"}}>
              <div style={{"fontSize":"12.5px","color":"var(--dim)"}}>
                {"Add a widget"}
              </div>
              <div style={{"display":"flex","flexWrap":"wrap","gap":"7px","marginTop":"10px"}}>
                {arr(v.widgetChoices).map((w: any, i17: number) => (
                  <Fragment key={i17}>
                    <button className="ixe" onClick={w?.add} style={{"height":"30px","display":"flex","alignItems":"center","gap":"7px","padding":"0 12px","background":"var(--surface-2)","border":"1px solid var(--border)","borderRadius":"var(--r-ctl,9px)","fontSize":"12px","color":"var(--body)","cursor":"pointer","transition":"border-color .2s var(--ease),transform .18s var(--ease)"}}>
                      <span style={{"color":"var(--accent)"}}>
                        {"+"}
                      </span>
                      {txt(w?.label)}
                    </button>
                  </Fragment>
                ))}
                {v.noWidgetChoices && (
                  <>
                    <span style={{"fontSize":"12px","color":"var(--faint)"}}>
                      {"Every widget is on the board."}
                    </span>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        <HomeBoard v={v} />
      </aside>
    </>
  );
}
